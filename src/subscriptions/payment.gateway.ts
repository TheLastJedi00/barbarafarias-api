import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Quem vai pagar. Na v2 do AbacatePay o bloco é **tudo ou nada** no PIX: se
 * `customer` for enviado, os quatro campos passam a ser obrigatórios. Por isso
 * `assertPayableProfile` (spec 013 Task 45.3) roda antes de chegar aqui.
 */
export interface GatewayCustomer {
  name?: string;
  email: string;
  cellphone?: string;
  taxId?: string;
}

/**
 * Identifica a linha do catálogo que o checkout hospedado vai cobrar. A v2 não
 * aceita mais produto inline: `checkouts/create` só recebe `id` de produto já
 * cadastrado, então o gateway mantém um catálogo derivado de (plano, valor).
 */
export interface ChargeProduct {
  /** Chave estável do plano (`MONTHLY`, `ANNUAL`, …). */
  key: string;
  /** Rótulo legível, usado no nome do produto no painel do gateway. */
  label: string;
}

export interface ChargeRequest {
  /** Valor em **reais**. A conversão para centavos é feita aqui dentro. */
  amount: number;
  description: string;
  /** Id da cobrança no nosso lado, para reconciliar depois. */
  externalId: string;
  customer: GatewayCustomer;
  /** Só o checkout usa; o PIX transparente cobra valor avulso. */
  product?: ChargeProduct;
}

/** Quem processou uma cobrança. Guardado na parcela para o webhook se achar. */
export const GATEWAY_PROVIDERS = {
  ABACATEPAY: 'ABACATEPAY',
  STRIPE: 'STRIPE',
} as const;

export type GatewayProvider =
  (typeof GATEWAY_PROVIDERS)[keyof typeof GATEWAY_PROVIDERS];

/**
 * Pedido de checkout de cartão. Estende o pedido de cobrança com o que só o
 * cartão tem: a recorrência e o cupom.
 *
 * O cupom vai **inteiro** para o gateway em vez de já abatido no `amount`
 * porque no Stripe quem aplica o desconto às renovações é ele — mandar o valor
 * pronto acertaria a primeira parcela e cobraria o preço cheio nas seguintes.
 */
export interface CheckoutRequest extends ChargeRequest {
  /** Plano do aluno, para o gateway resolver o produto/preço do catálogo. */
  plan: string;
  /**
   * Quantos ciclos mensais a assinatura tem. `null` = sem fim (plano mensal);
   * `6`/`12` fecham o semestral e o anual no fim do período.
   */
  recurring?: { cycles: number | null };
  coupon?: {
    code: string;
    /** Abatimento em **reais** por parcela. */
    amountOff: number;
    /** `null` = vitalício. */
    durationMonths: number | null;
  };
}

export interface PixChargeResult {
  id: string;
  /** Código copia-e-cola. */
  brCode: string;
  /** QR Code em base64 (data URI pronta para `<img src>`). */
  brCodeBase64: string;
}

/**
 * Um checkout aberto. Os dois provedores entregam coisas diferentes e as duas
 * são opcionais de propósito: o AbacatePay hospeda a página e devolve `url`
 * (o front redireciona), o Stripe roda incorporado e devolve `clientSecret`
 * (o front monta o formulário na própria tela).
 */
export interface CheckoutResult {
  id: string;
  provider: GatewayProvider;
  url?: string;
  clientSecret?: string;
  /** Id da assinatura no gateway, quando o checkout cria uma. */
  subscriptionId?: string;
}

/**
 * Raiz das portas de cobrança. Existe pelo mesmo motivo do `PayoutProvider` do
 * fechamento das professoras: a regra de negócio (cronograma, cupom, status)
 * não deve saber qual gateway está do outro lado, e os testes não devem
 * precisar de rede.
 */
export abstract class PaymentGateway {
  /** `false` quando não há chave configurada — o plano nasce sem cobrança. */
  abstract isEnabled(): boolean;
}

/**
 * Cobrança por PIX. Separada do cartão porque nenhum provedor implementa os
 * dois de verdade: o Stripe não emite PIX recorrente para este caso de uso, e
 * o cartão saiu do AbacatePay nesta spec. Uma porta só obrigaria cada
 * implementação a carregar metade dos métodos jogando "não suportado".
 */
export abstract class PixGateway extends PaymentGateway {
  abstract createPixCharge(request: ChargeRequest): Promise<PixChargeResult>;
  /** Simula a confirmação do PIX no ambiente de testes do gateway. */
  abstract simulatePayment(chargeId: string): Promise<boolean>;
}

/** Cobrança recorrente por cartão. Implementada pelo Stripe (spec 014). */
export abstract class CardGateway extends PaymentGateway {
  abstract createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  /**
   * Encerra a assinatura no gateway. Tolerante a já estar encerrada: o
   * cancelamento pela tela e o webhook do próprio gateway podem chegar em
   * qualquer ordem.
   */
  abstract cancelSubscription(subscriptionId: string): Promise<void>;
}

/** R$ → centavos, que é a unidade da API do AbacatePay. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Uma hora para pagar o PIX antes de o QR Code expirar. */
export const PIX_EXPIRATION_SECONDS = 3600;

/** Raiz da API. A v1 foi desligada para chaves novas — ver nota da classe. */
const ABACATEPAY_BASE_URL = 'https://api.abacatepay.com/v2';

/**
 * Formas de pagamento pedidas no checkout hospedado. Só `PIX`: a loja não tem
 * cartão habilitado, e pedir `CARD` faz a v2 **recusar a criação inteira** com
 * "CARD is not available for this store", derrubando também o PIX. Desde a
 * spec 014 isso deixou de ser contorno — o cartão é do Stripe.
 */
const CHECKOUT_METHODS = ['PIX'];

/**
 * AbacatePay na **API v2**.
 *
 * A migração não foi cosmética: as chaves emitidas hoje são v2 e a v1 responde
 * `API key version mismatch` para elas, o que deixava toda cobrança presa no
 * `warning` genérico de `issueCharge` (spec 013, teste contra a dev remota).
 *
 * Três diferenças de contrato moldam esta classe:
 *
 * 1. `pixQrCode/create` virou `transparents/create`, com o corpo envelopado em
 *    `{ method, data }`.
 * 2. `billing/create` virou `checkouts/create` e **não aceita mais produto
 *    inline** — só `id` de produto do catálogo. Daí `resolveProductId`.
 * 3. O checkout ignora `customer` inline (devolve `customerId: null`); o
 *    pagador precisa estar cadastrado. Daí `resolveCustomerId`.
 *
 * O SDK `abacatepay-nodejs-sdk` saiu do caminho: a versão 1.6.0 só conhece as
 * rotas v1 (`billing`, `pixQrCode`).
 *
 * **Só implementa a porta de PIX** desde a spec 014. O `createCheckout` e o
 * catálogo de produtos continuam aqui, fora da porta e sem ninguém chamando:
 * são o caminho de volta se o cartão do Stripe ficar indisponível (conta em
 * análise, por exemplo), e foram acertados contra a API de verdade em quatro
 * PRs. Apagá-los custaria pouco agora e caro depois.
 */
@Injectable()
export class AbacatePayGateway extends PixGateway {
  private readonly logger = new Logger(AbacatePayGateway.name);
  private readonly apiKey?: string;
  private readonly appBaseUrl: string;

  /**
   * `externalId` do produto → `id` no gateway. O catálogo é pequeno e estável
   * (uma linha por plano e valor), então basta memória: o custo de errar é uma
   * consulta a mais depois de um restart, não uma cobrança errada.
   */
  private readonly productIds = new Map<string, string>();

  constructor(private readonly configService: ConfigService) {
    super();
    this.apiKey = this.configService.get<string>('ABACATEPAY_API_KEY');
    this.appBaseUrl =
      this.configService.get<string>('APP_BASE_URL') ?? 'http://localhost:4200';

    if (!this.apiKey) {
      // Mesma postura do ResendService: a ausência da chave não derruba a
      // aplicação. O aluno vê o plano escolhido e um aviso de que a cobrança
      // não pôde ser emitida, em vez de um 500 sem explicação.
      this.logger.warn(
        'ABACATEPAY_API_KEY ausente: cobranças não serão emitidas.',
      );
    }
  }

  isEnabled(): boolean {
    return !!this.apiKey;
  }

  async createPixCharge(request: ChargeRequest): Promise<PixChargeResult> {
    const payload = {
      method: 'PIX',
      data: {
        amount: toCents(request.amount),
        expiresIn: PIX_EXPIRATION_SECONDS,
        description: request.description,
        externalId: request.externalId,
        customer: request.customer,
      },
    };

    try {
      const data = await this.abacateFetch('/transparents/create', {
        method: 'POST',
        body: payload,
      });
      if (!data?.id || !data.brCode) {
        throw new Error(`Resposta incompleta: ${JSON.stringify(data)}`);
      }
      return {
        id: data.id,
        brCode: data.brCode,
        brCodeBase64: data.brCodeBase64,
      };
    } catch (error: any) {
      throw new Error(`AbacatePay não devolveu o QR Code: ${error.message}`);
    }
  }

  async createCheckout(request: ChargeRequest): Promise<CheckoutResult> {
    const returnUrl = `${this.appBaseUrl}/meu-plano`;

    try {
      const productId = await this.resolveProductId(request);
      const customerId = await this.resolveCustomerId(request.customer);

      const payload: Record<string, unknown> = {
        items: [{ id: productId, quantity: 1 }],
        externalId: request.externalId,
        methods: CHECKOUT_METHODS,
        returnUrl,
        completionUrl: `${returnUrl}?pagamento=concluido`,
      };
      // Sem cadastro, o próprio checkout hospedado colhe os dados do pagador —
      // é degradação de conveniência, não de correção, então não vale derrubar
      // a cobrança por causa dela.
      if (customerId) payload.customerId = customerId;

      const data = await this.abacateFetch('/checkouts/create', {
        method: 'POST',
        body: payload,
      });
      if (!data?.id || !data.url) {
        throw new Error(`Resposta incompleta: ${JSON.stringify(data)}`);
      }
      return {
        id: data.id,
        url: data.url,
        provider: GATEWAY_PROVIDERS.ABACATEPAY,
      };
    } catch (error: any) {
      throw new Error(`AbacatePay não devolveu o checkout: ${error.message}`);
    }
  }

  async simulatePayment(chargeId: string): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      await this.abacateFetch(
        `/transparents/simulate-payment?id=${encodeURIComponent(chargeId)}`,
        { method: 'POST', body: {} },
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Falha ao simular pagamento de ${chargeId}: ${String(error)}`,
      );
      return false;
    }
  }

  // ------------------------------------------------------------- catálogo

  /**
   * Devolve o produto do catálogo que representa (plano, valor), criando-o na
   * primeira vez. A chave carrega o valor em centavos porque cupom e parcela
   * mudam o preço, e produto do gateway tem preço fixo: sem o valor na chave,
   * um desconto sairia cobrando o preço cheio.
   */
  private async resolveProductId(request: ChargeRequest): Promise<string> {
    const cents = toCents(request.amount);
    const key = request.product?.key ?? 'AVULSO';
    const label = request.product?.label ?? 'Cobrança';
    const externalId = `bf-${key}-${cents}`;

    const cached = this.productIds.get(externalId);
    if (cached) return cached;

    const existing = await this.findProductByExternalId(externalId);
    if (existing) {
      this.productIds.set(externalId, existing);
      return existing;
    }

    try {
      const data = await this.abacateFetch('/products/create', {
        method: 'POST',
        body: {
          externalId,
          name: `${label} — ${formatBRL(cents)}`,
          price: cents,
          currency: 'BRL',
        },
      });
      if (!data?.id) {
        throw new Error(`Resposta incompleta: ${JSON.stringify(data)}`);
      }
      this.productIds.set(externalId, data.id);
      return data.id;
    } catch (error: any) {
      // `products/create` não é idempotente: repetir o `externalId` responde
      // 400 "Product with externalId already exists". Duas instâncias criando
      // a mesma parcela ao mesmo tempo caem aqui — a segunda relê a lista em
      // vez de estourar.
      const recovered = await this.findProductByExternalId(externalId);
      if (recovered) {
        this.productIds.set(externalId, recovered);
        return recovered;
      }
      throw error;
    }
  }

  /**
   * `products/get` e **não** `products/list?externalId=`: a listagem, mesmo
   * filtrada, omite produtos que existem de fato — comprovado contra a API,
   * criando um produto que a `list` nunca devolvia e cuja recriação era
   * recusada com "already exists". Confiar nela travava toda cobrança por
   * checkout em processo novo, que é o caso normal em produção.
   *
   * Ausência chega como erro (400 "Product not found"), não como resposta
   * vazia; por isso o catch devolve `undefined` em vez de propagar. Um erro
   * real (chave inválida, rede) reaparece na criação logo em seguida, com a
   * mensagem do gateway.
   */
  private async findProductByExternalId(
    externalId: string,
  ): Promise<string | undefined> {
    try {
      const data = await this.abacateFetch(
        `/products/get?externalId=${encodeURIComponent(externalId)}`,
        { method: 'GET' },
      );
      return data?.id;
    } catch {
      return undefined;
    }
  }

  /**
   * `customers/create` **é** idempotente pelo e-mail: repetir a chamada devolve
   * o mesmo `cust_…`. Por isso não há busca antes — a criação já é a busca.
   *
   * Falhar aqui não pode derrubar a cobrança: o checkout hospedado funciona sem
   * `customerId`, só sem os campos preenchidos de antemão.
   */
  private async resolveCustomerId(
    customer: GatewayCustomer,
  ): Promise<string | undefined> {
    try {
      const data = await this.abacateFetch('/customers/create', {
        method: 'POST',
        body: customer,
      });
      return data?.id;
    } catch (error) {
      this.logger.warn(
        `Não foi possível cadastrar o pagador no gateway: ${String(error)}`,
      );
      return undefined;
    }
  }

  // ---------------------------------------------------------------- HTTP

  private async abacateFetch(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown },
  ): Promise<any> {
    if (!this.apiKey) throw new Error('AbacatePay não configurado');

    const res = await fetch(`${ABACATEPAY_BASE_URL}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'fariasbarbara-api',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    const data = await res.json().catch(() => null);

    // A v2 responde 4xx de verdade nos erros (400 para regra de negócio, 422
    // para payload inválido) e põe a mensagem em `error`, string.
    if (!res.ok || data?.success === false) {
      const errorMsg =
        data?.error || data?.message || JSON.stringify(data) || res.statusText;
      throw new Error(errorMsg);
    }

    return data?.data ?? data;
  }
}

/**
 * Cartão pelo checkout hospedado do AbacatePay.
 *
 * **Provisório**: existe para a porta de cartão ter uma implementação entre a
 * separação (Task 50) e o `StripeGateway` (Fase 2), preservando o
 * comportamento que estava em produção. A Fase 2 troca a classe no módulo.
 */
@Injectable()
export class AbacatePayCardGateway extends CardGateway {
  constructor(private readonly abacate: AbacatePayGateway) {
    super();
  }

  isEnabled(): boolean {
    return this.abacate.isEnabled();
  }

  createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    return this.abacate.createCheckout(request);
  }

  /**
   * O checkout do AbacatePay cobra uma parcela por vez: não há assinatura do
   * lado dele para encerrar, e cancelar aqui já basta. Só o Stripe tem o que
   * desfazer lá fora.
   */
  cancelSubscription(): Promise<void> {
    return Promise.resolve();
  }
}

/** `24000` → `R$ 240,00`. Só para nomear o produto no painel do gateway. */
function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
