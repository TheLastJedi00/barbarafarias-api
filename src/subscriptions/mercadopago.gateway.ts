import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { MercadoPagoConfig, Order, PreApproval } from 'mercadopago';
import { MPRateLimitError } from 'mercadopago/dist/utils/errors';
import type { OrderResponse } from 'mercadopago/dist/clients/order/commonTypes';
import {
  ChargeRequest,
  PIX_EXPIRATION_SECONDS,
  PaymentGateway,
  PixChargeResult,
  PixGateway,
} from './payment.gateway';

/**
 * Token dos clientes do Mercado Pago. Os clientes são construídos pelo módulo,
 * não pelo gateway, pelo mesmo motivo do `STRIPE_CLIENT`: os testes injetam um
 * dublê e **nenhuma suíte deste projeto toca a rede**.
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
 * Isto está escrito aqui pelo mesmo motivo que `STRIPE_API_VERSION` existia: o
 * vocabulário de status das duas é **diferente** (§4.6), e alguém que copie um
 * exemplo de `/v1/payments` traz junto o `approved`, que nesta API não existe.
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
export class MercadoPagoGateway extends PaymentGateway implements PixGateway {
  protected readonly logger = new Logger(MercadoPagoGateway.name);

  constructor(
    @Inject(MERCADOPAGO_CLIENT)
    protected readonly mp: MercadoPagoClients | null,
  ) {
    super();
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
          payer: { email: request.customer.email },
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
      this.rethrow(error, 'PIX');
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
  protected rethrow(error: unknown, context: string): never {
    if (error instanceof MPRateLimitError) {
      throw new GatewayBusyError(
        `${context}: Mercado Pago pediu para tentar de novo`,
        error.retryAfter,
      );
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
 * A chave é **derivada** do id da cobrança, não sorteada: um UUID novo a cada
 * chamada tem o formato certo e não protege de nada. Dois cliques no botão de
 * pagar precisam produzir a **mesma** chave para virarem uma cobrança só — que
 * é a única razão de o cabeçalho existir.
 *
 * O formato continua sendo UUID v4 (a versão e a variante são fixadas nas
 * posições que a RFC 4122 manda), porque é o que a doc pede.
 */
export function idempotencyKeyFor(externalId: string): string {
  const hex = createHash('sha256')
    .update(externalId)
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
