import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  MercadoPagoConfig,
  Order,
  PreApproval,
  WebhookSignatureValidator,
} from 'mercadopago';
import {
  MPIdempotencyError,
  MPNotFoundError,
  MPRateLimitError,
  MercadoPagoError,
} from 'mercadopago/dist/utils/errors';
import type { OrderResponse } from 'mercadopago/dist/clients/order/commonTypes';
import {
  CHARGE_OUTCOMES,
  CardGateway,
  CardTokenRef,
  ChargeRequest,
  CheckoutRequest,
  CheckoutResult,
  GATEWAY_PROVIDERS,
  GatewayCustomer,
  PIX_EXPIRATION_SECONDS,
  PixChargeResult,
  PixGateway,
} from './payment.gateway';
import {
  PREAPPROVAL_STATUS,
  type OrderStatusPair,
  type SubscriptionCycle,
  outcomeOfOrder,
} from './mercadopago.status';

/**
 * Token dos clientes do Mercado Pago. Os clientes são construídos pelo módulo,
 * não pelo gateway, para os testes injetarem um dublê: **nenhuma suíte deste
 * projeto toca a rede**.
 *
 * `null` quando não há chave configurada.
 */
export const MERCADOPAGO_CLIENT = 'MERCADOPAGO_CLIENT';

/**
 * **Qual API é usada, e por que a outra não** (spec 023 §9.5).
 *
 * A Orders API (`/v1/orders`) é o caminho **documentado e recomendado** do
 * Checkout Transparente no Brasil: é o que a visão geral do produto ensina e
 * para onde as outras APIs (Payment Intents, QR, Pedidos Presenciais) têm guia
 * de migração. Quem é legado é `/v1/payments`, que sobrevive como "Checkout API
 * via API Payments" — a maior parte do material de terceiros ainda fala dele.
 *
 * Isto está escrito aqui porque o vocabulário de status das duas é
 * **diferente** (§4.6): alguém que copie um exemplo de `/v1/payments` traz
 * junto o `approved`, que nesta API não existe — e um `if` que nunca é
 * verdadeiro não dá acesso a ninguém nem lança erro nenhum.
 *
 * Assinaturas (`/preapproval`) é um produto à parte, com endpoint, vocabulário
 * e tópico de webhook próprios. Daí este gateway ser uma classe com duas
 * metades: parcelado por Orders, mensal por `preapproval`.
 */
export const MERCADOPAGO_APIS = {
  /** PIX à vista e cartão parcelado. */
  ORDERS: '/v1/orders',
  /** Assinatura recorrente do plano mensal. */
  SUBSCRIPTIONS: '/preapproval',
  /** **Não usada.** Legado; vocabulário de status incompatível (§4.6). */
  LEGACY_PAYMENTS: '/v1/payments',
} as const;

/** Raiz da API, para os poucos recursos que o SDK não tem cliente. */
export const MERCADOPAGO_BASE_URL = 'https://api.mercadopago.com';

/**
 * O que aparece na fatura do cartão do aluno.
 *
 * Existe para **reduzir contestação**, e aqui o peso é maior que o normal: um
 * débito de até R$ 2.280 sem reembolso, com um nome irreconhecível na fatura, é
 * o roteiro clássico do "não fui eu". O limite prático é ~13 caracteres.
 */
export const STATEMENT_DESCRIPTOR = 'BFARIAS';

/**
 * Categoria do item na taxonomia do provedor.
 *
 * A antifraude compara a compra com o padrão da categoria — e aula de idioma é
 * serviço de educação, não varejo. Categoria errada é pior que ausente: alinha
 * a transação com a estatística de outro mercado.
 */
export const ITEM_CATEGORY = 'learnings';

/**
 * **3DS 2.0 ligado** (spec 023 §9.6) — decisão da dona, não padrão do provedor.
 *
 * Sem este nó o padrão é `validation: 'never'`: nenhuma autenticação, e o
 * prejuízo de uma contestação é da vendedora. Num produto de até R$ 2.280 sem
 * cancelamento nem reembolso — o perfil de compra que mais atrai contestação —
 * o *liability shift* transfere essa responsabilidade para a bandeira, e de
 * quebra aumenta a taxa de aprovação.
 *
 * `on_fraud_risk` e não `always`: o desafio só aparece quando o emissor acha
 * que precisa, então a maior parte dos alunos não vê etapa nenhuma a mais.
 *
 * **O preço disto é um ramo de UX obrigatório.** A order pode voltar
 * `action_required` / `pending_challenge` com a URL em
 * `payment_method.transaction_security.url`, e o aluno tem 40 minutos para
 * completar. Ligar isto **sem** tratar o desafio é a pior combinação possível:
 * o aluno é debitado, a tela diz "concluído" e a cobrança nunca completa
 * (falha silenciosa 19). Por isso `outcomeOfOrder` tem um valor só para este
 * caso, e ele não é sucesso.
 *
 * `liability_shift: 'required'` é o **único** valor aceito, e não pode ser
 * enviado quando `validation` for `never` — os dois andam juntos ou nenhum vai.
 */
export const TRANSACTION_SECURITY = {
  validation: 'on_fraud_risk',
  liability_shift: 'required',
} as const;

/**
 * Os dois clientes do provedor, cada um com o **seu** access token.
 *
 * Não é preciosismo: no ambiente de teste a Orders API usa token com prefixo
 * `APP_USR` e Assinaturas usa `TEST-`, os dois válidos ao mesmo tempo (§9.4).
 * Um cliente só obrigaria a escolher qual caminho quebrar.
 */
export interface MercadoPagoClients {
  orders: Order;
  subscriptions: PreApproval;
  /**
   * Token de Assinaturas cru. O SDK não tem cliente para
   * `/authorized_payments/{id}`, que é o recurso que a notificação de cada
   * ciclo do mensal aponta.
   */
  subscriptionsToken: string;
}

/**
 * Os tópicos de notificação que interessam.
 *
 * `order` é **singular** — é o nome do evento no painel ("Order (Mercado
 * Pago)") — e cobre PIX e cartão parcelado. `subscription_authorized_payment`
 * é cada ciclo do mensal. `subscription_preapproval` é a assinatura em si, e
 * existe por um motivo que não é óbvio: depois de 3 parcelas recusadas o
 * Mercado Pago **cancela sozinho** (§9.7) — sem escutar este tópico, o
 * cancelamento dele nunca chegaria até nós e o aluno ficaria ativo no nosso
 * banco sem nada sendo cobrado lá fora.
 */
export const MP_TOPICS = {
  ORDER: 'order',
  SUBSCRIPTION_PAYMENT: 'subscription_authorized_payment',
  SUBSCRIPTION: 'subscription_preapproval',
} as const;

/** O corpo da notificação, que traz o id e nada mais de confiável. */
export interface MercadoPagoNotification {
  type?: string;
  action?: string;
  data?: { id?: string };
}

/**
 * A notificação depois de o recurso ter sido buscado de verdade.
 *
 * A order aparece como o **par de status**, não como o tipo do SDK: quem
 * consome isto é a regra de domínio, e ela não deve conhecer o formato do
 * fornecedor. É a mesma razão de as portas existirem.
 */
export type MercadoPagoDomainEvent =
  | { topic: typeof MP_TOPICS.ORDER; id: string; order: OrderStatusPair }
  | {
      topic: typeof MP_TOPICS.SUBSCRIPTION_PAYMENT;
      id: string;
      cycle: SubscriptionCycle;
    }
  | { topic: typeof MP_TOPICS.SUBSCRIPTION; id: string; status?: string };

/**
 * Gateway fora do ar de forma **temporária** — 429 com `Retry-After`, que a
 * doc da Orders API prevê como caminho normal.
 *
 * Existe separado de um erro qualquer porque o desfecho é outro: 429 é
 * degradação (o aluno vê "tente em instantes" e o plano fica gravado), não
 * falha de programação. Sem esta distinção o 429 viraria 500.
 */
export class GatewayBusyError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number | null,
  ) {
    super(message);
    this.name = 'GatewayBusyError';
  }
}

/**
 * Chave de idempotência reusada com corpo diferente (409).
 *
 * Depois que a chave passou a incluir o token do cartão isto virou raro, mas
 * continua possível — e merece nome próprio porque a saída é específica: **um
 * envio novo do formulário resolve**, já que ele emite outro token. Sem esta
 * tradução o aluno lê "MercadoPago API error" e não tem o que fazer.
 */
export class GatewayConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayConflictError';
  }
}

/**
 * Raiz das duas metades do Mercado Pago (spec 023).
 *
 * O desenho é o mesmo dos gateways anteriores: a ausência de chave **não**
 * derruba a aplicação — o aluno vê o plano gravado com um aviso de cobrança
 * indisponível em vez de um 500 sem explicação.
 *
 * Duas regras valem para tudo aqui dentro:
 *
 * 1. **Nenhum dado cru de cartão passa por aqui.** O token é gerado no
 *    navegador pelo Payment Brick, vale 7 dias e um único uso; o backend só
 *    troca ids. É a garantia que a spec 014 estabeleceu, preservada.
 * 2. **Valores vão como string com duas casas** (`"1200.00"`). Mandar `1200`
 *    ou `1200.0` é o tipo de divergência que some no JSON e reaparece no
 *    extrato.
 */
@Injectable()
export class MercadoPagoGateway extends CardGateway implements PixGateway {
  protected readonly logger = new Logger(MercadoPagoGateway.name);

  /** Base do front, para o `back_url` que o `preapproval` exige. */
  private readonly appBaseUrl: string;
  /** Segredo da assinatura das notificações. Ausente = webhook recusado. */
  private readonly webhookSecret?: string;

  constructor(
    @Inject(MERCADOPAGO_CLIENT)
    protected readonly mp: MercadoPagoClients | null,
    configService: ConfigService,
  ) {
    super();
    this.appBaseUrl =
      configService.get<string>('APP_BASE_URL') ?? 'http://localhost:4200';
    this.webhookSecret = configService.get<string>('MP_WEBHOOK_SECRET');
    if (!this.mp) {
      this.logger.warn(
        'MP_ACCESS_TOKEN_ORDERS/MP_ACCESS_TOKEN_SUBSCRIPTIONS ausentes: cobranças não serão emitidas.',
      );
    }
  }

  isEnabled(): boolean {
    return !!this.mp;
  }

  // ------------------------------------------------------------------- PIX

  /**
   * PIX à vista, por `POST /v1/orders`.
   *
   * O bloco de pagamento pede **dois** campos, não um: `id: 'pix'` e
   * `type: 'bank_transfer'`. Faltando o segundo, a API não sabe que meio é.
   *
   * A resposta traz o QR **aninhado** em
   * `transactions.payments[0].payment_method` — não na raiz, que é onde a
   * intuição procura. Daí `readPixCodes` existir separado: o mapeamento errado
   * não dá erro, dá um modal em branco.
   *
   * O `PixChargeResult` não muda de forma, então o `pix-payment-modal` do front
   * nem sabe que o provedor trocou.
   */
  async createPixCharge(request: ChargeRequest): Promise<PixChargeResult> {
    const orders = this.require().orders;
    const amount = toAmountString(request.amount);

    try {
      const order = await orders.create({
        body: {
          type: 'online',
          processing_mode: 'automatic',
          total_amount: amount,
          external_reference: request.externalId,
          description: request.description,
          items: itemsOf(request),
          config: { statement_descriptor: STATEMENT_DESCRIPTOR },
          payer: payerOf(request.customer),
          transactions: {
            payments: [
              {
                amount,
                payment_method: { id: 'pix', type: 'bank_transfer' },
                // Duração ISO 8601, **nunca segundos**: `3600` não é "o padrão
                // de 24h", é payload inválido — ou, pior, aceito e
                // interpretado de um jeito que ninguém previu.
                expiration_time: toIsoDuration(PIX_EXPIRATION_SECONDS),
              },
            ],
          },
        },
        requestOptions: {
          idempotencyKey: idempotencyKeyFor(request.externalId),
        },
      });

      return await this.pixResultOf(order);
    } catch (error) {
      this.rethrow(error, 'PIX', request);
    }
  }

  /**
   * Lê o QR da order, **reconsultando quando ele ainda não existe**.
   *
   * A doc avisa que a criação do pagamento pode ser assíncrona: *"a order fica
   * com o status de processando e sem informações"*. Nesse caminho não há
   * `qr_code` na resposta, e um mapeamento ingênuo devolveria
   * `brCode: undefined` — que atravessa o backend, a DTO e o modal sem ninguém
   * reclamar, e termina numa tela em branco sem erro.
   *
   * Por isso são duas defesas: uma reconsulta a `GET /v1/orders/{id}`, e um
   * erro nomeado se nem assim vier. O erro cai no `catch` de `issueCharge`, que
   * já sabe degradar com `warning` — o aluno lê "tente em instantes" em vez de
   * encarar um retângulo vazio.
   */
  private async pixResultOf(order: OrderResponse): Promise<PixChargeResult> {
    const id = order.id;
    if (!id) {
      throw new Error(`Mercado Pago não devolveu o id da order de PIX`);
    }

    const codes = readPixCodes(order);
    if (codes) return { id, ...codes };

    this.logger.warn(
      `Order ${id} criada de forma assíncrona (sem QR): reconsultando.`,
    );
    const refetched = await this.require().orders.get({ id });
    const retried = readPixCodes(refetched);
    if (retried) return { id, ...retried };

    throw new Error(
      `Order ${id} ainda sem QR Code depois da reconsulta (status ${refetched.status})`,
    );
  }

  /**
   * O Mercado Pago **não tem** simulação de pagamento de PIX por API: no
   * ambiente de teste quem paga é a conta de teste compradora, pelo próprio
   * QR. Devolver `false` mantém o contrato da porta e deixa o `mockPay` do
   * `DEV_MODE` confirmar a parcela do nosso lado, que é o que ele já fazia
   * quando o gateway estava sem chave.
   */
  simulatePayment(chargeId: string): Promise<boolean> {
    this.logger.warn(
      `Simulação de pagamento não existe no Mercado Pago; ${chargeId} segue pendente lá fora.`,
    );
    return Promise.resolve(false);
  }

  // ---------------------------------------------------------------- cartão

  /**
   * Cobra no cartão. Qual produto do Mercado Pago é usado sai de
   * `recurring.cycles`, que é a mesma régua que monta o cronograma:
   *
   * - **número de ciclos** (Semestral, Anual) → uma order parcelada, aqui;
   * - **`null`** (Mensal) → uma assinatura recorrente (`preapproval`).
   */
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const cycles = request.recurring?.cycles ?? null;
    return cycles === null
      ? this.createSubscription(request)
      : this.createInstallmentOrder(request);
  }

  /**
   * Mensal: assinatura recorrente por `POST /preapproval`.
   *
   * **Cartão é o único meio documentado.** `status: 'authorized'` exige
   * `card_token_id`; sem meio de pagamento a assinatura nasce `pending` e o
   * aluno precisa abrir um link do Mercado Pago para escolher — ou seja,
   * redirecionamento, que a spec 014 proibiu. É por isso que PIX no plano
   * mensal não é assinatura: é o QR avulso de `createPixCharge`, renovado a
   * cada ciclo.
   *
   * **`auto_recurring.repetitions` não aparece aqui, e é decisão.** Ele fecharia
   * o Semestral e o Anual em 6 ou 12 ciclos nativamente, e é tentador — mas
   * seriam 6 cobranças de R$ 200 que podem falhar na quarta, que é exatamente o
   * bug que esta spec veio corrigir, reencenado com outro sotaque. Plano
   * fechado é **uma** cobrança parcelada (`createInstallmentOrder`).
   *
   * **A criação faz uma cobrança de validação** de valor mínimo, estornada em
   * seguida — a doc é explícita. Um valor pequeno aparece e some no extrato do
   * aluno. Não é bug, mas é pergunta de suporte garantida se ninguém souber.
   *
   * E o desfecho é `PENDING`, nunca `PAID`: **criar assinatura não é ter
   * recebido.** A primeira cobrança sai em até ~1 hora. Ativar o plano na
   * resposta deste POST libera acesso antes de existir dinheiro — e para
   * sempre, se a cobrança falhar (falha silenciosa 20).
   */
  private async createSubscription(
    request: CheckoutRequest,
  ): Promise<CheckoutResult> {
    const card = this.requireCard(request);

    try {
      const preapproval = await this.require().subscriptions.create({
        body: {
          reason: request.planLabel ?? request.description,
          external_reference: request.externalId,
          payer_email: request.customer.email,
          card_token_id: card.token,
          status: PREAPPROVAL_STATUS.AUTHORIZED,
          back_url: `${this.appBaseUrl}/meu-plano`,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: request.amount,
            currency_id: 'BRL',
          },
        },
        requestOptions: {
          idempotencyKey: idempotencyKeyFor(request.externalId, card.token),
        },
      });

      const id = preapproval.id;
      if (!id) {
        throw new Error('Mercado Pago não devolveu o id da assinatura');
      }

      return {
        id,
        subscriptionId: id,
        provider: GATEWAY_PROVIDERS.MERCADOPAGO,
        outcome: CHARGE_OUTCOMES.PENDING,
      };
    } catch (error) {
      this.rethrow(error, 'Assinatura mensal', request);
    }
  }

  /**
   * Semestral e Anual: **uma** cobrança, parcelada pelo emissor.
   *
   * É a correção do bug de origem desta spec. O que antes eram seis
   * assinaturas mensais que podiam falhar na quarta passa a ser um débito só,
   * e o parcelamento inteiro é o campo `installments` — sem catálogo de preço,
   * sem teto de ciclos, sem as duas redes de segurança que existiam para
   * impedir a cobrança a mais.
   *
   * Três detalhes que a doc fixa e que somem em silêncio se forem ignorados:
   * valores vão como **string**, o `X-Idempotency-Key` é **obrigatório**, e o
   * `429` é caminho previsto (vira `GatewayBusyError`, não 500).
   */
  private async createInstallmentOrder(
    request: CheckoutRequest,
  ): Promise<CheckoutResult> {
    const card = this.requireCard(request);
    // **Nunca do que o front mandou.** A trava do formulário é conveniência;
    // esta linha é a régua (falha silenciosa 18).
    const installments = this.requireInstallments(request);
    const amount = toAmountString(request.amount);

    try {
      const order = await this.require().orders.create({
        body: {
          type: 'online',
          processing_mode: 'automatic',
          total_amount: amount,
          external_reference: request.externalId,
          description: describeCharge(request),
          items: itemsOf(request),
          config: {
            statement_descriptor: STATEMENT_DESCRIPTOR,
            online: { transaction_security: TRANSACTION_SECURITY },
          },
          payer: payerOf(request.customer),
          transactions: {
            payments: [
              {
                amount,
                payment_method: {
                  id: card.paymentMethodId,
                  type: 'credit_card',
                  token: card.token,
                  installments,
                },
              },
            ],
          },
        },
        requestOptions: {
          idempotencyKey: idempotencyKeyFor(request.externalId, card.token),
        },
      });

      return this.resultOfOrder(order);
    } catch (error) {
      this.rethrow(error, 'Cartão parcelado', request);
    }
  }

  /**
   * Relê a order e devolve o desfecho de agora (ver a porta).
   *
   * A mesma tradução da criação — `resultOfOrder` — de propósito: se a leitura
   * de "pago" divergisse entre criar e reconsultar, um desafio 3DS concluído
   * confirmaria a parcela por um caminho e não pelo outro.
   */
  async fetchChargeOutcome(chargeId: string): Promise<CheckoutResult> {
    try {
      const order = await this.require().orders.get({ id: chargeId });
      return this.resultOfOrder(order);
    } catch (error) {
      this.rethrow(error, `Releitura da order ${chargeId}`);
    }
  }

  /** Traduz a order para o desfecho que a regra de negócio entende. */
  protected resultOfOrder(order: OrderResponse): CheckoutResult {
    const payment = order.transactions?.payments?.[0];
    const outcome = outcomeOfOrder(order);

    if (outcome === CHARGE_OUTCOMES.REJECTED) {
      this.logger.warn(
        `Order ${order.id} recusada: ${order.status}/${order.status_detail}`,
      );
    }

    const challengeUrl =
      payment?.payment_method?.transaction_security?.url ??
      payment?.payment_method?.redirect_url;

    // **Desafio sem URL é um beco sem saída**: a tela não tem o que renderizar,
    // o aluno fica esperando e o dinheiro está reservado. Se acontecer, o que
    // resolve é saber **onde** a URL veio parar — daí logar a forma da resposta
    // (só nomes de campo; nenhum valor, porque aqui trafega dado de cartão).
    if (outcome === CHARGE_OUTCOMES.CHALLENGE && !challengeUrl) {
      this.logger.error(
        `Order ${order.id} pediu desafio 3DS e não trouxe URL. ` +
          `Campos do meio de pagamento: ${Object.keys(payment?.payment_method ?? {}).join(', ') || '(vazio)'}` +
          ` | campos do pagamento: ${Object.keys(payment ?? {}).join(', ') || '(vazio)'}`,
      );
    }

    return {
      id: order.id ?? '',
      provider: GATEWAY_PROVIDERS.MERCADOPAGO,
      outcome,
      challengeUrl,
      detail: order.status_detail,
    };
  }

  /**
   * Encerra a assinatura recorrente: `PUT /preapproval/{id}` com status
   * `cancelled`. Não há endpoint de exclusão — cancelar é mudar de estado.
   *
   * Tolerante a já estar encerrada, como o gateway anterior: o cancelamento
   * pela tela e o cancelamento automático do Mercado Pago (§9.7) chegam em
   * qualquer ordem e caminham para o mesmo destino.
   */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      await this.require().subscriptions.update({
        id: subscriptionId,
        body: { status: PREAPPROVAL_STATUS.CANCELLED },
      });
    } catch (error) {
      if (error instanceof MPNotFoundError) {
        this.logger.warn(
          `Assinatura ${subscriptionId} já não existe no Mercado Pago.`,
        );
        return;
      }
      throw error;
    }
  }

  /**
   * Acerta o valor do ciclo quando o cupom com prazo acaba (ver a porta).
   * `currency_id` é obrigatório no corpo mesmo mudando só o valor.
   */
  async updateSubscriptionAmount(
    subscriptionId: string,
    amount: number,
  ): Promise<void> {
    await this.require().subscriptions.update({
      id: subscriptionId,
      body: {
        auto_recurring: { transaction_amount: amount, currency_id: 'BRL' },
      },
    });
  }

  /**
   * O cartão tokenizado, ou um erro nomeado.
   *
   * A porta o declara opcional só até os gateways antigos saírem (Task 24).
   * Aqui ele é obrigatório de fato: sem token não há o que cobrar, e deixar
   * `undefined` seguir viagem produziria um 400 do provedor sem dizer o motivo.
   */
  private requireCard(request: CheckoutRequest): CardTokenRef {
    if (!request.card?.token || !request.card.paymentMethodId) {
      throw new Error('Cobrança de cartão sem token: nada a enviar');
    }
    return request.card;
  }

  /** As parcelas do plano, ou um erro nomeado. Mesma nota de `requireCard`. */
  private requireInstallments(request: CheckoutRequest): number {
    const installments = request.installments;
    if (!installments || installments < 1) {
      throw new Error(
        `Cobrança de cartão sem número de parcelas válido: ${installments}`,
      );
    }
    return installments;
  }

  // --------------------------------------------------------------- webhook

  /**
   * Confere a assinatura da notificação. Levanta se não bater.
   *
   * **Segredo ausente = recusa**, nunca "aceita sem conferir". A postura é
   * herdada da integração anterior e o motivo está escrito lá: sem esta
   * conferência, um POST anônimo vira assinatura ativa.
   *
   * A validação é a do **SDK oficial** — mesmo motivo de usar
   * o verificador do provedor em vez de um HMAC caseiro. Ele monta o
   * manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com o
   * ponto-e-vírgula final e omitindo campo ausente, que são duas das três
   * regras que quebram a validação em silêncio.
   *
   * **A terceira regra o SDK não implementa**, e por isso ela está aqui: a doc
   * manda converter `data.id` para minúsculas. Os ids de order **são**
   * maiúsculos (`ORD01JQ4S…`), então isso não é caso de borda, é o caso normal
   * — sem ele nenhuma notificação de order validaria.
   *
   * Daí tentar as duas grafias. Não enfraquece nada: as duas são HMAC com o
   * mesmo segredo, e quem não o tem não forja nenhuma das duas. O que se ganha
   * é não depender de qual das duas leituras o provedor adotou hoje — o modo
   * de falha alternativo seria 100% das notificações recusadas, e é dele que
   * nasce a gambiarra de "desligar a conferência para destravar".
   */
  verifyNotification(input: {
    xSignature?: string | string[];
    xRequestId?: string | string[];
    dataId?: string | string[];
  }): void {
    const secret = this.webhookSecret;
    if (!secret) {
      throw new Error('MP_WEBHOOK_SECRET ausente: webhook não verificável');
    }

    const dataId = Array.isArray(input.dataId) ? input.dataId[0] : input.dataId;
    const candidates = [dataId?.toLowerCase(), dataId];

    let last: unknown;
    for (const candidate of candidates) {
      try {
        WebhookSignatureValidator.validate({
          xSignature: input.xSignature,
          xRequestId: input.xRequestId,
          dataId: candidate,
          secret,
        });
        return;
      } catch (error) {
        last = error;
      }
    }
    throw last;
  }

  /**
   * Busca o recurso que a notificação aponta e o traduz.
   *
   * A notificação traz **só o id**: nada nela diz se o pagamento entrou. Quem
   * decide é o recurso, buscado agora — confiar no corpo da notificação seria
   * aceitar o estado que quem a enviou disse que era.
   *
   * Tópico desconhecido devolve `null`: registra-se e responde 200, porque
   * repetir para sempre uma notificação que nunca vamos tratar só enche a fila
   * do provedor.
   */
  async resolveNotification(
    notification: MercadoPagoNotification,
  ): Promise<MercadoPagoDomainEvent | null> {
    const id = notification.data?.id;
    if (!id) {
      this.logger.warn(
        `Notificação de ${notification.type} sem id: nada a buscar.`,
      );
      return null;
    }

    switch (notification.type) {
      case MP_TOPICS.ORDER:
        return {
          topic: MP_TOPICS.ORDER,
          id,
          order: await this.require().orders.get({ id }),
        };
      case MP_TOPICS.SUBSCRIPTION_PAYMENT:
        return {
          topic: MP_TOPICS.SUBSCRIPTION_PAYMENT,
          id,
          cycle: await this.fetchSubscriptionCycle(id),
        };
      case MP_TOPICS.SUBSCRIPTION: {
        const preapproval = await this.require().subscriptions.get({ id });
        return {
          topic: MP_TOPICS.SUBSCRIPTION,
          id,
          status: preapproval.status,
        };
      }
      default:
        this.logger.log(`Tópico ignorado: ${notification.type}`);
        return null;
    }
  }

  /**
   * A parcela do mensal, em `/authorized_payments/{id}`.
   *
   * Vai por `fetch` porque o SDK não tem cliente para este recurso — e é
   * justamente ele que carrega o pagamento associado, sem o qual `processed`
   * de assinatura é ambíguo entre pago e recusado quatro vezes.
   */
  private async fetchSubscriptionCycle(id: string): Promise<SubscriptionCycle> {
    const { subscriptionsToken } = this.require();
    const response = await fetch(
      `${MERCADOPAGO_BASE_URL}/authorized_payments/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${subscriptionsToken}` } },
    );
    if (!response.ok) {
      throw new Error(
        `Parcela de assinatura ${id} não pôde ser lida: ${response.status}`,
      );
    }
    return (await response.json()) as SubscriptionCycle;
  }

  /**
   * Os clientes ou um erro nomeado. Sem isto a chave ausente viraria um
   * `TypeError: Cannot read properties of null` lá adiante, longe da causa.
   */
  protected require(): MercadoPagoClients {
    if (!this.mp) throw new Error('Mercado Pago não configurado');
    return this.mp;
  }

  /**
   * Traduz o erro do SDK. Só o 429 muda de natureza; todo o resto continua
   * estourando com a mensagem do provedor, porque engolir erro de cobrança é
   * como o bug de origem desta spec passou despercebido.
   */
  protected rethrow(
    error: unknown,
    context: string,
    request?: ChargeRequest,
  ): never {
    if (error instanceof MPRateLimitError) {
      throw new GatewayBusyError(
        `${context}: Mercado Pago pediu para tentar de novo`,
        error.retryAfter,
      );
    }

    /*
     * **Loga antes de repassar, e o que loga é o pedido — não a resposta.**
     *
     * O SDK monta o erro a partir de `message`, `error` e `cause`. A Orders API
     * responde em `errors[].details`, que ele **descarta inteiro**: o que chega
     * aqui é "MercadoPago API error" com causas vazias. Foi assim que um 400 de
     * e-mail inválido em sandbox custou uma reprodução manual da chamada.
     *
     * Como a resposta se perde no caminho, o que resta de útil é registrar o
     * que **nós** mandamos. Os campos escolhidos são os que costumam ofender —
     * e nenhum deles é dado de cartão, que não passa por aqui.
     */
    const enviado = request ? ` | ${summarizeRequest(request)}` : '';

    if (error instanceof MPIdempotencyError) {
      this.logger.error(
        `${context}: conflito de chave de idempotência (409) — mesma chave ` +
          `com corpo diferente. O envio precisa de um token novo.${enviado}`,
      );
      throw new GatewayConflictError(
        `${context}: cobrança já tentada com outros dados`,
      );
    }

    if (error instanceof MercadoPagoError) {
      this.logger.error(
        `${context} recusado pelo Mercado Pago (${error.status}): ` +
          `${error.error || error.message}` +
          ` | causas: ${JSON.stringify(error.causes ?? [])}${enviado}`,
      );
    } else {
      this.logger.error(`${context} falhou: ${String(error)}${enviado}`);
    }
    throw error;
  }
}

/**
 * O copia-e-cola e a imagem do QR, **aninhados** em
 * `transactions.payments[0].payment_method`.
 *
 * `undefined` quando o pagamento ainda não existe (criação assíncrona) — e é
 * por isso que o retorno é "tudo ou nada" em vez de um objeto com campos
 * opcionais: meio QR não serve para nada, e um `brCode: undefined` que chega à
 * tela é a falha silenciosa 16 do catálogo.
 */
export function readPixCodes(
  order: OrderResponse,
): { brCode: string; brCodeBase64: string } | undefined {
  const method = order.transactions?.payments?.[0]?.payment_method;
  if (!method?.qr_code || !method.qr_code_base64) return undefined;
  return { brCode: method.qr_code, brCodeBase64: method.qr_code_base64 };
}

/**
 * A descrição que aparece no painel do Mercado Pago.
 *
 * O código do cupom entra **aqui** porque a Orders API não tem campo de
 * metadata livre, e sem ele um pedido de R$ 1.150 num plano de R$ 1.200 vira
 * uma divergência sem explicação na hora da conciliação.
 */
export function describeCharge(request: CheckoutRequest): string {
  return request.couponCode
    ? `${request.description} (cupom ${request.couponCode})`
    : request.description;
}

/**
 * O pagador, com **documento e nome**, não só o e-mail.
 *
 * No Brasil o cartão exige `payer.identification`: sem ele a Orders API recusa
 * a criação com 400. É justamente o "Documento do titular" que o formulário
 * coleta — e que não adiantava nada se parasse no navegador.
 *
 * Nome e sobrenome não são obrigatórios, mas entram porque melhoram a análise
 * antifraude, e é ela que decide entre aprovar e pedir o desafio 3DS.
 *
 * O CPF vai **só com dígitos**: a máscara da tela (`390.533.447-05`) é
 * apresentação, e mandá-la assim é recusa na certa.
 */
/**
 * A linha de item do pedido.
 *
 * O checklist de qualidade do Mercado Pago cobra `items` como **obrigatório**,
 * e a razão não é burocrática: título, descrição, preço e categoria alimentam a
 * antifraude, que é quem decide entre aprovar, pedir desafio 3DS e recusar. Sem
 * eles a transação é julgada às cegas, e o custo de uma recusa indevida é uma
 * venda perdida — que não aparece em log nenhum.
 *
 * É **um** item: o aluno compra um plano, não um carrinho. `unit_price` é o
 * total e `quantity` é 1 — no parcelado quem divide é o emissor, e descrever
 * "12 unidades de R$ 190" diria ao provedor algo que não é verdade.
 */
export function itemsOf(
  request: ChargeRequest,
): Array<Record<string, unknown>> {
  return [
    {
      title: request.product?.label ?? request.description,
      description: request.description,
      external_code: request.product?.key ?? 'PLANO',
      category_id: ITEM_CATEGORY,
      quantity: 1,
      unit_price: toAmountString(request.amount),
    },
  ];
}

/**
 * O pedido, resumido para o log de uma recusa.
 *
 * **Domínio do e-mail, não o e-mail.** O que se precisa saber é se ele atende à
 * regra do ambiente — o sandbox exige `@testuser.com` e recusa qualquer outro
 * com 400 —, e o endereço inteiro num log é dado pessoal sem ganho nenhum.
 *
 * Do documento vai só a presença e o tamanho: CPF ausente ou truncado é recusa
 * certa, e o número não precisa estar aqui para isso ficar evidente.
 *
 * **Nada de cartão aparece** — nem o token, que é de uso único mas ainda assim
 * é credencial de pagamento.
 */
export function summarizeRequest(request: ChargeRequest): string {
  const dominio = request.customer.email?.split('@')[1] ?? '(sem e-mail)';
  const doc = request.customer.taxId?.replace(/\D/g, '');
  const parcelas = (request as CheckoutRequest).installments;

  return [
    `ref=${request.externalId}`,
    `valor=${toAmountString(request.amount)}`,
    parcelas ? `parcelas=${parcelas}` : 'parcelas=n/a',
    `emailDominio=${dominio}`,
    `doc=${doc ? `${doc.length} dígitos` : 'ausente'}`,
  ].join(' ');
}

export function payerOf(customer: GatewayCustomer): {
  email: string;
  first_name?: string;
  last_name?: string;
  identification?: { type: string; number: string };
  phone?: { area_code: string; number: string };
} {
  const digits = customer.taxId?.replace(/\D/g, '');
  const [first, ...rest] = (customer.name ?? '').trim().split(/\s+/);
  const fone = customer.cellphone?.replace(/\D/g, '');

  return {
    email: customer.email,
    ...(first ? { first_name: first } : {}),
    ...(rest.length ? { last_name: rest.join(' ') } : {}),
    ...(digits ? { identification: { type: 'CPF', number: digits } } : {}),
    // DDD separado do número, como a API pede, e só quando está completo: um
    // telefone pela metade não ajuda a antifraude e vira ruído no painel.
    ...(fone && fone.length >= 10
      ? { phone: { area_code: fone.slice(0, 2), number: fone.slice(2) } }
      : {}),
  };
}

/** `1200` → `"1200.00"`. A Orders API recusa número e aceita string. */
export function toAmountString(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Segundos → duração ISO 8601 (`3600` → `"PT1H"`).
 *
 * `expiration_time` **não** é segundos: o exemplo da doc é `"P3Y6M4DT12H30M5S"`
 * e a faixa aceita vai de 30 minutos a 30 dias. Mandar `3600` não é "o padrão
 * de 24h" — é payload inválido, ou pior, aceito e interpretado de um jeito que
 * ninguém previu.
 */
export function toIsoDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  const parts =
    (hours ? `${hours}H` : '') +
    (minutes ? `${minutes}M` : '') +
    (rest || (!hours && !minutes) ? `${rest}S` : '');
  return `PT${parts}`;
}

/**
 * `X-Idempotency-Key` da criação de um pedido — **obrigatório** na Orders API,
 * não uma boa prática opcional.
 *
 * A chave é **derivada**, não sorteada: um UUID novo a cada chamada tem o
 * formato certo e não protege de nada. Dois cliques no botão de pagar precisam
 * produzir a **mesma** chave para virarem uma cobrança só — que é a única razão
 * de o cabeçalho existir.
 *
 * **`attempt` existe por causa de um 409 encontrado em ambiente de teste**, e a
 * lição vale escrever. Derivar a chave só do id da cobrança a torna *eterna*, e
 * não é isso que se quer: a primeira tentativa foi recusada por payload
 * inválido, o payload foi corrigido, e o Mercado Pago passou a responder 409 —
 * mesma chave, corpo diferente. A cobrança ficou **permanentemente bloqueada**.
 *
 * O que precisa ser estável é a *tentativa*, não a cobrança. No cartão o
 * discriminador natural é o **token**: o formulário emite um por envio, então
 * dois cliques do mesmo envio compartilham a chave (protegido) e uma
 * retentativa de verdade traz token novo (liberada).
 *
 * No PIX não há token, e a omissão é deliberada: reemitir a mesma parcela deve
 * devolver **o mesmo QR**, não criar um segundo código pagável. Regerar é ação
 * explícita, e é da spec 024 §8.1.
 *
 * O formato continua sendo UUID v4 (a versão e a variante são fixadas nas
 * posições que a RFC 4122 manda), porque é o que a doc pede.
 */
export function idempotencyKeyFor(externalId: string, attempt = ''): string {
  const hex = createHash('sha256')
    .update(attempt ? `${externalId}|${attempt}` : externalId)
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);

  const id = hex.join('');
  return [
    id.slice(0, 8),
    id.slice(8, 12),
    id.slice(12, 16),
    id.slice(16, 20),
    id.slice(20),
  ].join('-');
}

/**
 * Constrói os clientes do Mercado Pago, ou `null` quando falta chave.
 *
 * Basta **um** dos dois tokens faltar para o gateway inteiro nascer desligado:
 * um provedor meio configurado cobraria por um caminho e falharia no outro, e
 * a falha apareceria só quando um aluno de plano mensal aparecesse.
 */
export function createMercadoPagoClients(
  config: ConfigService,
): MercadoPagoClients | null {
  const ordersToken = config.get<string>('MP_ACCESS_TOKEN_ORDERS');
  const subscriptionsToken = config.get<string>(
    'MP_ACCESS_TOKEN_SUBSCRIPTIONS',
  );
  if (!ordersToken || !subscriptionsToken) return null;

  return {
    orders: new Order(new MercadoPagoConfig({ accessToken: ordersToken })),
    subscriptions: new PreApproval(
      new MercadoPagoConfig({ accessToken: subscriptionsToken }),
    ),
    subscriptionsToken,
  };
}
