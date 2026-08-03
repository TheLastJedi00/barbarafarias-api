import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { UserRepository } from '../users/user.repository';
import {
  CardGateway,
  CheckoutRequest,
  CheckoutResult,
  GATEWAY_PROVIDERS,
  GatewayCustomer,
  toCents,
} from './payment.gateway';

/**
 * Token do cliente do Stripe. O cliente é construído pelo módulo, não pelo
 * gateway, para os testes poderem injetar um dublê — nenhuma suíte deste
 * projeto deve depender de rede (`stripe.gateway.spec.ts`).
 *
 * `null` quando não há chave configurada.
 */
export const STRIPE_CLIENT = 'STRIPE_CLIENT';

/**
 * Versão da API fixada explicitamente. O SDK já traria esta mesma versão por
 * padrão, mas escrevê-la aqui é o que impede uma atualização de dependência de
 * mudar o formato de resposta sem ninguém decidir isso.
 */
export const STRIPE_API_VERSION = '2026-07-29.dahlia';

/**
 * Cartão de crédito pelo Stripe (spec 014).
 *
 * O desenho é o mesmo do `AbacatePayGateway`: a ausência de chave não derruba a
 * aplicação — o aluno vê o plano gravado com um aviso de cobrança indisponível
 * em vez de um 500 sem explicação.
 *
 * Duas regras da spec valem para tudo aqui dentro:
 *
 * 1. **Nunca** mandar `payment_method_types`. Quem decide os métodos aceitos é
 *    o painel do Stripe; fixar no código congelaria o cartão e desligaria os
 *    outros métodos que aumentam conversão.
 * 2. Nenhum dado cru de cartão (PAN, CVC) passa por aqui. O formulário é do
 *    Stripe, e o backend só troca ids e segredos de sessão.
 */
@Injectable()
export class StripeGateway extends CardGateway {
  private readonly logger = new Logger(StripeGateway.name);
  private readonly appBaseUrl: string;

  /** `bf-plan-<PLANO>` → `prod_…`. Ver `resolveProductId`. */
  private readonly productIds = new Map<string, string>();
  /** `bf-<PLANO>-<centavos>` → `price_…`. Ver `resolvePriceId`. */
  private readonly priceIds = new Map<string, string>();
  /** `bf-<CODIGO>-<centavos>` → `coupon`. Ver `resolveCouponId`. */
  private readonly couponIds = new Map<string, string>();

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly users: UserRepository,
    private readonly configService: ConfigService,
  ) {
    super();
    this.appBaseUrl =
      this.configService.get<string>('APP_BASE_URL') ?? 'http://localhost:4200';

    if (!this.stripe) {
      this.logger.warn(
        'STRIPE_SECRET_KEY ausente: cobranças de cartão não serão emitidas.',
      );
    }
  }

  isEnabled(): boolean {
    return !!this.stripe;
  }

  /**
   * Abre uma sessão de checkout **incorporada**: o formulário do cartão é
   * montado na nossa página (`ui_mode: 'embedded_page'`), não numa aba do
   * Stripe, e o que volta é o `client_secret` — nunca dado de cartão.
   *
   * `mode: 'subscription'` nos três planos. O mensal não tem fim; o semestral e
   * o anual são a mesma assinatura mensal com um teto de ciclos, que é como o
   * nosso cronograma já os modela (uma cobrança por mês, não um parcelamento
   * de cartão dividido no emissor). O teto **não** é aplicado aqui porque
   * `subscription_data` não aceita `cancel_at`: quem o aplica é o webhook, no
   * `checkout.session.completed`, e o `metadata.cycles` é o que carrega a
   * informação até lá.
   */
  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const stripe = this.require();
    const returnUrl = `${this.appBaseUrl}/meu-plano?pagamento=concluido&session_id={CHECKOUT_SESSION_ID}`;

    const [customer, price] = await Promise.all([
      this.resolveCustomerId(request.studentId, request.customer),
      this.resolvePriceId(
        request.plan,
        request.planLabel ?? request.plan,
        request.amount,
      ),
    ]);

    const cycles = request.recurring?.cycles ?? null;
    const params: Stripe.Checkout.SessionCreateParams = {
      ui_mode: 'embedded_page',
      mode: 'subscription',
      customer,
      line_items: [{ price, quantity: 1 }],
      return_url: returnUrl,
      // Rótulo do fluxo no painel, para comparar integrações. O sufixo
      // aleatório é exigência do formato.
      integration_identifier: `bf-assinatura-${randomLetters(8)}`,
      subscription_data: {
        metadata: {
          studentId: request.studentId,
          plan: request.plan,
          chargeIndex: String(request.chargeIndex ?? 1),
          ...(cycles === null ? {} : { cycles: String(cycles) }),
        },
      },
      metadata: { studentId: request.studentId, externalId: request.externalId },
    };

    if (request.coupon) {
      params.discounts = [{ coupon: await this.resolveCouponId(request.coupon) }];
    }
    // `payment_method_types` não aparece aqui de propósito: fixá-lo congelaria
    // o cartão e desligaria os métodos que o painel habilitar depois.

    const session = await stripe.checkout.sessions.create(params);
    if (!session.client_secret) {
      throw new Error('Stripe não devolveu o client_secret da sessão');
    }

    return {
      id: session.id,
      clientSecret: session.client_secret,
      provider: GATEWAY_PROVIDERS.STRIPE,
    };
  }

  // ------------------------------------------------------------- pagador

  /**
   * Devolve o `cus_…` do aluno, cadastrando-o na primeira vez.
   *
   * O id fica **gravado no documento do aluno**, não numa busca por e-mail:
   * `customers.create` não é idempotente, então sem persistir cada contratação
   * criaria um cliente novo e espalharia o histórico do mesmo aluno por vários
   * no painel. `customers.search` resolveria em teoria, mas é eventualmente
   * consistente — logo após criar, ela ainda devolve vazio.
   */
  async resolveCustomerId(
    studentId: string,
    customer: GatewayCustomer,
  ): Promise<string> {
    const student = await this.users.findById(studentId);
    if (student?.stripeCustomerId) return student.stripeCustomerId;

    const created = await this.require().customers.create({
      email: customer.email,
      name: customer.name,
      phone: customer.cellphone,
      metadata: { studentId },
    });

    await this.users.setStripeCustomerId(studentId, created.id);
    return created.id;
  }

  // ------------------------------------------------------------ catálogo

  /**
   * Devolve o Price recorrente mensal de (plano, valor da parcela), criando o
   * Product e o Price na primeira vez.
   *
   * Duas escolhas que valem explicação:
   *
   * - **Um Product por plano**, nunca um só com vários preços: a fatura e o
   *   checkout mostram o nome do Product em cada linha, e três planos num
   *   Product só deixariam "Plano" em todas elas.
   * - **O valor entra no `lookup_key`** porque cupom e plano mudam a parcela e
   *   Price tem preço fixo. Sem o valor na chave, um desconto reusaria o Price
   *   cheio e cobraria o preço errado — o mesmo motivo do `externalId` do
   *   AbacatePay.
   *
   * O cache em memória é o mesmo trato do `AbacatePayGateway`: o catálogo é
   * pequeno e estável, e o custo de errar é uma consulta a mais depois de um
   * restart, não uma cobrança errada.
   */
  async resolvePriceId(
    plan: string,
    label: string,
    installmentAmount: number,
  ): Promise<string> {
    const cents = toCents(installmentAmount);
    const lookupKey = `bf-${plan}-${cents}`;

    const cached = this.priceIds.get(lookupKey);
    if (cached) return cached;

    const stripe = this.require();
    const existing = await stripe.prices.list({
      lookup_keys: [lookupKey],
      limit: 1,
    });
    if (existing.data.length) {
      this.priceIds.set(lookupKey, existing.data[0].id);
      return existing.data[0].id;
    }

    const price = await stripe.prices.create({
      product: await this.resolveProductId(plan, label),
      currency: 'brl',
      unit_amount: cents,
      recurring: { interval: 'month' },
      lookup_key: lookupKey,
    });
    this.priceIds.set(lookupKey, price.id);
    return price.id;
  }

  /**
   * Traduz o nosso cupom para um `Coupon` do Stripe, criando-o na primeira vez.
   *
   * O mapeamento é exato — `durationMonths: null` (vitalício) é `forever`, e um
   * número é `repeating` com os mesmos meses —, e é por isso que passamos o
   * cupom inteiro em vez do valor já abatido: quem aplica o desconto às
   * renovações passa a ser o Stripe. Abater aqui acertaria a primeira parcela
   * e cobraria o preço cheio em todas as seguintes.
   *
   * O desconto entra no id porque a gerente pode editar o valor de um cupom; se
   * o id fosse só o código, o cupom novo reusaria o desconto antigo para
   * sempre.
   */
  async resolveCouponId(coupon: {
    code: string;
    amountOff: number;
    durationMonths: number | null;
  }): Promise<string> {
    const id = `bf-${coupon.code}-${toCents(coupon.amountOff)}`;
    const cached = this.couponIds.get(id);
    if (cached) return cached;

    const stripe = this.require();
    try {
      const found = await stripe.coupons.retrieve(id);
      this.couponIds.set(id, found.id);
      return found.id;
    } catch {
      // Ausência chega como erro, igual ao Product acima.
    }

    const created = await stripe.coupons.create({
      id,
      amount_off: toCents(coupon.amountOff),
      currency: 'brl',
      name: coupon.code,
      ...(coupon.durationMonths === null
        ? { duration: 'forever' as const }
        : {
            duration: 'repeating' as const,
            duration_in_months: coupon.durationMonths,
          }),
    });
    this.couponIds.set(id, created.id);
    return created.id;
  }

  /**
   * O Product do plano, por **id determinístico** em vez de `products.search`:
   * a busca é eventualmente consistente e devolveria vazio logo depois de
   * criar, duplicando o produto no painel a cada contratação.
   */
  private async resolveProductId(plan: string, label: string): Promise<string> {
    const id = `bf-plan-${plan}`;
    const cached = this.productIds.get(id);
    if (cached) return cached;

    const stripe = this.require();
    try {
      const found = await stripe.products.retrieve(id);
      this.productIds.set(id, found.id);
      return found.id;
    } catch {
      // Ausência chega como erro ("No such product"), não como resposta vazia.
      // Um erro real (chave inválida, rede) reaparece na criação logo abaixo,
      // já com a mensagem do Stripe.
    }

    const created = await stripe.products.create({ id, name: label });
    this.productIds.set(id, created.id);
    return created.id;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async cancelSubscription(_subscriptionId: string): Promise<void> {
    this.require();
    throw new Error('cancelSubscription chega na Task 57');
  }

  /**
   * O cliente ou um erro nomeado. Sem isto a chave ausente viraria um
   * `TypeError: Cannot read properties of null` lá adiante, longe da causa.
   */
  private require(): Stripe {
    if (!this.stripe) throw new Error('Stripe não configurado');
    return this.stripe;
  }
}

/** Sufixo aleatório do `integration_identifier`, que o formato exige. */
function randomLetters(length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from(
    { length },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join('');
}

/** Constrói o cliente do Stripe, ou `null` quando não há chave. */
export function createStripeClient(config: ConfigService): Stripe | null {
  const key = config.get<string>('STRIPE_SECRET_KEY');
  if (!key) return null;
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}
