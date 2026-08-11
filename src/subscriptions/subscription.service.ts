import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionRepository } from './subscription.repository';
import { CouponRepository } from './coupon.repository';
import { UserRepository } from '../users/user.repository';
import type { User } from '../users/user.entity';
import {
  CHARGE_OUTCOMES,
  CardGateway,
  GATEWAY_PROVIDERS,
  PixGateway,
  toCents,
} from './payment.gateway';
import type { CheckoutResult } from './payment.gateway';
import { GatewayBusyError } from './mercadopago.gateway';
import { MP_TOPICS } from './mercadopago.gateway';
import type { MercadoPagoDomainEvent } from './mercadopago.gateway';
import {
  isOrderPaid,
  isPreapprovalDead,
  isSubscriptionCyclePaid,
} from './mercadopago.status';
import type { OrderStatusPair, SubscriptionCycle } from './mercadopago.status';
import {
  CHARGE_STATUS,
  Charge,
  PAYMENT_METHODS,
  RECURRING_SCHEDULE_MONTHS,
  SUBSCRIPTION_STATUS,
  Subscription,
  grantsAccess,
  planConfig,
} from './subscription.entity';
import type { PaymentMethod, SubscriptionPlan } from './subscription.entity';
import {
  Coupon,
  applyDiscount,
  normalizeCouponCode,
  round2,
} from './coupon.entity';
import {
  CardPaymentDto,
  CardPaymentResponseDto,
  ChangePaymentMethodDto,
  ChoosePlanDto,
  ChoosePlanResponseDto,
  CreateCouponDto,
  SubscriptionDto,
} from './dto/subscription.dto';
import { todayInAppTimezone } from '../common/time';
import { randomUUID } from 'node:crypto';

/** Desconto aplicado a uma parcela, já resolvido contra o cupom. */
interface ResolvedCoupon {
  code: string;
  discount: number;
  /** Quantas parcelas recebem o abatimento. `null` = todas (vitalício). */
  remaining: number | null;
}

/** Mensagem única do bloqueio — a tela repete exatamente esta frase. */
export const PIX_INSTALLMENT_BLOCKED =
  'O parcelamento está disponível apenas no cartão de crédito.';

/**
 * PIX não fecha plano parcelado (spec 018 Task 114).
 *
 * **O que se está evitando é parcela futura de um compromisso já fechado sem
 * cobrança automática** — não recorrência. Por isso a régua é `installments`, e
 * não `recurring`: o Mensal continua aceitando PIX, porque ele não tem parcela
 * futura, tem renovação, e o aluno que não quiser renovar simplesmente não
 * paga o próximo QR. Já o Semestral e o Anual comprometem o aluno com 6 ou 12
 * cobranças que dependeriam dele lembrar de pagar uma a uma.
 *
 * Tecnicamente o PIX parcelado **funciona** hoje (o gateway emite um QR por
 * parcela); a decisão é de negócio, e vive aqui — no serviço, não na tela —
 * porque há duas portas de entrada para o método de pagamento.
 */
export function assertMethodAllowed(
  plan: SubscriptionPlan,
  method: PaymentMethod,
): void {
  if (
    method === PAYMENT_METHODS.PIX_RECURRING &&
    planConfig(plan).installments > 1
  ) {
    throw new BadRequestException(PIX_INSTALLMENT_BLOCKED);
  }
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly coupons: CouponRepository,
    private readonly users: UserRepository,
    private readonly pix: PixGateway,
    private readonly card: CardGateway,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------- aluno

  /**
   * Escolhe (ou troca) o plano. Monta o cronograma inteiro de uma vez para que
   * o aluno veja todas as datas de cobrança logo na contratação (RF5), e emite
   * só a primeira — as demais são geradas quando a anterior é confirmada.
   */
  async choosePlan(
    studentId: string,
    dto: ChoosePlanDto,
  ): Promise<ChoosePlanResponseDto> {
    const student = await this.users.findById(studentId);
    if (!student) {
      throw new NotFoundException('Aluno não encontrado');
    }
    this.assertPayableProfile(student);
    assertMethodAllowed(dto.plan, dto.paymentMethod);

    const existing = await this.subscriptions.findByStudent(studentId);
    if (existing && existing.status === SUBSCRIPTION_STATUS.ACTIVE) {
      // Trocar de plano com assinatura ativa exigiria pró-rata e estorno da
      // parcela em curso — regra que a spec não define. Cancelar antes deixa
      // a decisão com o aluno e evita cobrar duas vezes o mesmo mês.
      throw new BadRequestException(
        'Cancele o plano atual antes de contratar outro.',
      );
    }

    const coupon = dto.couponCode
      ? await this.resolveCoupon(dto.couponCode)
      : null;

    const subscription = this.buildSubscription(
      studentId,
      dto.plan,
      dto.paymentMethod,
      coupon,
    );
    await this.subscriptions.save(subscription);
    await this.syncUser(subscription);

    const payment = await this.issueCharge(subscription, student.email, {
      name: student.fullName,
      cellphone: student.phone,
      taxId: student.cpf,
    });

    return {
      subscription: new SubscriptionDto(subscription),
      paymentMethod: subscription.paymentMethod,
      ...payment,
    };
  }

  /**
   * Cobra no cartão com o token que o formulário do gateway gerou no navegador.
   *
   * Segundo passo da contratação por cartão: `choosePlan` grava o plano e
   * devolve quanto e em quantas vezes; a tela monta o formulário, tokeniza o
   * cartão e chama aqui. **Nenhum dado de cartão passa por este método** — só
   * o token de uso único.
   *
   * O que o cliente manda de parcelas **não é lido**: `installments` sai do
   * `PLAN_CONFIGS` logo abaixo. A trava do formulário é conveniência; sem esta
   * linha, um aluno decidido paga em 1x um plano vendido em 12x e nada acusa.
   */
  async payWithCard(
    studentId: string,
    dto: CardPaymentDto,
  ): Promise<CardPaymentResponseDto> {
    const subscription = await this.requireSubscription(studentId);
    if (subscription.paymentMethod !== PAYMENT_METHODS.CREDIT_CARD) {
      throw new BadRequestException('O plano atual não é de cartão.');
    }
    if (subscription.status === SUBSCRIPTION_STATUS.CANCELLED) {
      throw new BadRequestException('Plano cancelado. Contrate um novo plano.');
    }

    const charge = this.nextPendingCharge(subscription);
    if (!charge) {
      throw new BadRequestException('Não há parcela em aberto para cobrar.');
    }

    const student = await this.users.findById(studentId);
    if (!student) {
      throw new NotFoundException('Aluno não encontrado');
    }
    this.assertPayableProfile(student);

    const config = planConfig(subscription.plan);
    let checkout: CheckoutResult;
    try {
      checkout = await this.card.createCheckout({
        ...this.chargeRequest(subscription, charge, student.email, {
          name: student.fullName,
          cellphone: student.phone,
          taxId: student.cpf,
        }),
        // Plano fechado cobra o **total** de uma vez, parcelado pelo emissor;
        // o mensal cobra a parcela do ciclo. É a diferença entre vender seis
        // meses e vender um mês que renova.
        amount: config.recurring ? charge.amount : subscription.totalAmount,
        plan: subscription.plan,
        planLabel: `Plano ${config.label}`,
        studentId,
        chargeIndex: charge.index,
        recurring: { cycles: config.recurring ? null : config.installments },
        installments: config.installments,
        card: { token: dto.token, paymentMethodId: dto.paymentMethodId },
        couponCode: subscription.couponCode,
      });
    } catch (error) {
      if (error instanceof GatewayBusyError) {
        // 429 é caminho previsto pela doc, não falha de programação: o plano
        // continua gravado e o aluno tenta de novo em instantes.
        this.logger.warn(
          `Cobrança de ${studentId} adiada pelo gateway: ${error.message}`,
        );
        return {
          subscription: new SubscriptionDto(subscription),
          outcome: CHARGE_OUTCOMES.PENDING,
          warning:
            'O pagamento está congestionado no momento. Tente novamente em instantes.',
        };
      }
      throw error;
    }

    charge.gatewayChargeId = checkout.id;
    charge.gatewayProvider = checkout.provider;
    if (checkout.subscriptionId) {
      subscription.gatewaySubscriptionId = checkout.subscriptionId;
    }
    await this.subscriptions.save(subscription);

    // **Só o desfecho creditado ativa.** `CHALLENGE` é 3DS pendente e
    // `PENDING` é assinatura recém-criada (a primeira cobrança sai em até ~1h):
    // dar o plano por ativo em qualquer um dos dois libera acesso antes de
    // existir dinheiro — e para sempre, se a cobrança falhar.
    if (checkout.outcome === CHARGE_OUTCOMES.PAID) {
      await this.confirmCharge(subscription, checkout.id, charge.index);
    }

    if (checkout.outcome === CHARGE_OUTCOMES.REJECTED) {
      throw new BadRequestException(
        'Pagamento recusado pelo emissor do cartão. Confira os dados ou tente outro cartão.',
      );
    }

    return {
      subscription: new SubscriptionDto(
        (await this.subscriptions.findByStudent(studentId)) ?? subscription,
      ),
      outcome: checkout.outcome,
      challengeUrl: checkout.challengeUrl,
    };
  }

  async getSubscription(studentId: string): Promise<SubscriptionDto | null> {
    const subscription = await this.subscriptions.findByStudent(studentId);
    return subscription ? new SubscriptionDto(subscription) : null;
  }

  /**
   * Troca a forma de pagamento (RF3). A parcela em aberto é reemitida no novo
   * método: manter o PIX antigo permitiria pagar duas vezes o mesmo mês.
   */
  async changePaymentMethod(
    studentId: string,
    dto: ChangePaymentMethodDto,
  ): Promise<ChoosePlanResponseDto> {
    const subscription = await this.requireSubscription(studentId);
    if (subscription.status === SUBSCRIPTION_STATUS.CANCELLED) {
      throw new BadRequestException('Plano cancelado. Contrate um novo plano.');
    }
    // A mesma regra da contratação: sem isto, bastaria contratar no cartão e
    // trocar para PIX em seguida para furar o bloqueio (spec 018 Task 114).
    assertMethodAllowed(subscription.plan, dto.paymentMethod);
    if (subscription.paymentMethod === dto.paymentMethod) {
      return {
        subscription: new SubscriptionDto(subscription),
        paymentMethod: subscription.paymentMethod,
      };
    }

    subscription.paymentMethod = dto.paymentMethod;
    subscription.updatedAt = new Date().toISOString();

    const student = await this.users.findById(studentId);
    if (!student) {
      throw new NotFoundException('Aluno não encontrado');
    }
    // A reemissão passa pelo gateway igual à contratação: sem CPF e celular
    // ela falharia lá dentro, agora com uma parcela já desvinculada.
    this.assertPayableProfile(student);

    // Sair do cartão encerra a recorrência: mantê-la faria o aluno pagar nos
    // dois trilhos no mês seguinte.
    await this.releaseGatewaySubscription(subscription);

    // A cobrança em aberto perde o vínculo com o gateway antigo antes de ser
    // reemitida — sem isso o webhook do PIX abandonado ainda a marcaria paga.
    const pending = this.nextPendingCharge(subscription);
    if (pending) {
      pending.gatewayChargeId = undefined;
      pending.gatewayProvider = undefined;
    }

    await this.subscriptions.save(subscription);
    const payment = await this.issueCharge(subscription, student.email, {
      name: student.fullName,
      cellphone: student.phone,
      taxId: student.cpf,
    });

    return {
      subscription: new SubscriptionDto(subscription),
      paymentMethod: subscription.paymentMethod,
      ...payment,
    };
  }

  /**
   * Cancela o plano (RF4). As parcelas já pagas continuam no histórico; as
   * pendentes deixam de ser cobradas. O churn é o próprio status `CANCELLED`
   * com a data — é o que o painel da gerente lê.
   */
  async cancelSubscription(studentId: string): Promise<SubscriptionDto> {
    const subscription = await this.requireSubscription(studentId);
    if (subscription.status === SUBSCRIPTION_STATUS.CANCELLED) {
      return new SubscriptionDto(subscription);
    }

    await this.releaseGatewaySubscription(subscription);

    const now = new Date().toISOString();
    subscription.status = SUBSCRIPTION_STATUS.CANCELLED;
    subscription.cancelledAt = now;
    subscription.updatedAt = now;
    subscription.nextChargeDate = undefined;
    subscription.charges = subscription.charges.filter(
      (charge) => charge.status === CHARGE_STATUS.PAID,
    );

    await this.subscriptions.save(subscription);
    await this.syncUser(subscription);
    return new SubscriptionDto(subscription);
  }

  /** Parcelas ainda não pagas, da mais próxima para a mais distante (RF5). */
  async getUpcomingCharges(studentId: string): Promise<Charge[]> {
    const subscription = await this.subscriptions.findByStudent(studentId);
    if (!subscription) return [];
    return subscription.charges
      .filter((charge) => charge.status !== CHARGE_STATUS.PAID)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  // -------------------------------------------------------------- webhook
  /**
   * Regra de domínio das notificações do Mercado Pago (spec 023).
   *
   * Recebe o evento **já verificado e com o recurso buscado**: nada do que
   * chega no corpo da notificação decide alguma coisa aqui.
   *
   * Idempotente do começo ao fim — o Mercado Pago reenvia até receber 2xx, e
   * espera resposta em até 22 segundos. `confirmCharge` já é idempotente por
   * recontagem, e essa propriedade é o que sustenta a reentrega.
   */
  async handleMercadoPagoEvent(event: MercadoPagoDomainEvent): Promise<void> {
    switch (event.topic) {
      case MP_TOPICS.ORDER:
        return this.onOrderUpdated(event.id, event.order);
      case MP_TOPICS.SUBSCRIPTION_PAYMENT:
        return this.onSubscriptionCycle(event.cycle);
      case MP_TOPICS.SUBSCRIPTION:
        return this.onPreapprovalUpdated(event.id, event.status);
    }
  }

  /**
   * Uma order mudou de estado — PIX pago, cartão parcelado aprovado, desafio
   * 3DS concluído.
   *
   * **Só o par `processed` + `accredited` confirma.** Tudo o mais é log: PIX
   * ainda aguardando o aluno, desafio pendente, recusa, e qualquer status que
   * o provedor invente depois. Ativar por exclusão libera acesso sem dinheiro.
   */
  private async onOrderUpdated(
    orderId: string,
    order: OrderStatusPair,
  ): Promise<void> {
    if (!isOrderPaid(order)) {
      this.logger.log(
        `Order ${orderId} em ${order.status}/${order.status_detail}: nada a confirmar.`,
      );
      return;
    }

    const subscription = await this.subscriptions.findByChargeId(orderId);
    if (!subscription) {
      this.logger.warn(`Order ${orderId} sem assinatura correspondente`);
      return;
    }

    await this.confirmCharge(subscription, orderId);
  }

  /**
   * Uma parcela do plano mensal foi processada.
   *
   * **`processed` aqui não quer dizer paga.** Depois da quarta tentativa
   * recusada a parcela também fica `processed`, associada a um pagamento
   * recusado — e um handler que trate os dois igual dá acesso vitalício de
   * graça para quem nunca pagou, responde 200 e não loga nada. Quem decide é
   * o pagamento associado.
   */
  private async onSubscriptionCycle(cycle: SubscriptionCycle): Promise<void> {
    const preapprovalId = cycle.preapproval_id;
    if (!preapprovalId) return;

    const subscription =
      await this.subscriptions.findByGatewaySubscriptionId(preapprovalId);
    if (!subscription) {
      this.logger.warn(`Assinatura ${preapprovalId} sem correspondente aqui`);
      return;
    }

    if (!isSubscriptionCyclePaid(cycle)) {
      // Recusa dentro das 4 tentativas ou depois delas: o aluno perde o acesso
      // até regularizar, e quem encerra a assinatura é o Mercado Pago (§9.7).
      this.logger.warn(
        `Parcela ${cycle.id} de ${preapprovalId} sem pagamento creditado (${cycle.status}).`,
      );
      await this.markPastDue(subscription);
      return;
    }

    const pending = this.nextPendingCharge(subscription);
    if (!pending) return;
    await this.confirmCharge(subscription, undefined, pending.index);
    await this.syncRecurringAmount(subscription);
  }

  /**
   * A assinatura acabou lá fora. Chega **sem ninguém pedir**: depois de 3
   * parcelas recusadas o Mercado Pago cancela sozinho. Não tentamos cancelar
   * de volta — o outro lado já fez isso.
   */
  private async onPreapprovalUpdated(
    preapprovalId: string,
    status?: string,
  ): Promise<void> {
    if (!isPreapprovalDead(status)) return;

    const subscription =
      await this.subscriptions.findByGatewaySubscriptionId(preapprovalId);
    if (!subscription) return;
    if (subscription.status === SUBSCRIPTION_STATUS.CANCELLED) return;

    const now = new Date().toISOString();
    subscription.status = SUBSCRIPTION_STATUS.CANCELLED;
    subscription.cancelledAt = now;
    subscription.updatedAt = now;
    subscription.nextChargeDate = undefined;
    subscription.gatewaySubscriptionId = undefined;
    subscription.charges = subscription.charges.filter(
      (charge) => charge.status === CHARGE_STATUS.PAID,
    );

    await this.subscriptions.save(subscription);
    await this.syncUser(subscription);
  }

  /** Parcela recusada: o aluno perde o acesso até regularizar (RF13). */
  private async markPastDue(subscription: Subscription): Promise<void> {
    if (subscription.status === SUBSCRIPTION_STATUS.PAST_DUE) return;
    subscription.status = SUBSCRIPTION_STATUS.PAST_DUE;
    subscription.updatedAt = new Date().toISOString();
    await this.subscriptions.save(subscription);
    await this.syncUser(subscription);
  }

  /**
   * Acerta o valor da assinatura recorrente quando a próxima parcela do nosso
   * cronograma passa a valer outra coisa — que é o que acontece no mês em que
   * um cupom com prazo acaba.
   *
   * Sem isto o desconto vira vitalício: a assinatura lá fora tem um valor só, e
   * ninguém reclama de receber a menos. É o tipo de erro que só aparece na
   * conciliação, meses depois.
   */
  private async syncRecurringAmount(subscription: Subscription): Promise<void> {
    const gatewayId = subscription.gatewaySubscriptionId;
    const next = this.nextPendingCharge(subscription);
    if (!gatewayId || !next || next.amount === subscription.installmentAmount) {
      return;
    }

    try {
      await this.card.updateSubscriptionAmount(gatewayId, next.amount);
      subscription.installmentAmount = next.amount;
      await this.subscriptions.save(subscription);
    } catch (error) {
      // Degradação: a próxima cobrança sai pelo valor antigo e a diferença
      // aparece no painel. Derrubar o webhook por isso faria o Mercado Pago
      // reenviar para sempre uma parcela que já foi confirmada.
      this.logger.error(
        `Valor do ciclo de ${gatewayId} não pôde ser ajustado para ${next.amount}: ${String(error)}`,
      );
    }
  }

  /**
   * Simulação local do pagamento do PIX. Só existe com `DEV_MODE=true`: em
   * produção a rota devolve 403 mesmo para o aluno dono da assinatura.
   */
  async mockPay(studentId: string): Promise<SubscriptionDto> {
    if (!this.isDevMode()) {
      throw new ForbiddenException('Simulação disponível apenas em DEV_MODE');
    }

    const subscription = await this.requireSubscription(studentId);
    const pending = this.nextPendingCharge(subscription);
    if (!pending) {
      throw new BadRequestException('Nenhuma parcela pendente para simular');
    }

    // Quando a cobrança existe no gateway, simulamos por lá: assim o webhook
    // também dispara e o caminho testado é o mesmo da produção.
    if (pending.gatewayChargeId && this.pix.isEnabled()) {
      await this.pix.simulatePayment(pending.gatewayChargeId);
    }

    await this.confirmCharge(
      subscription,
      pending.gatewayChargeId,
      pending.index,
    );
    return new SubscriptionDto(
      (await this.subscriptions.findByStudent(studentId))!,
    );
  }

  isDevMode(): boolean {
    return this.configService.get<string>('DEV_MODE') === 'true';
  }

  // --------------------------------------------------------------- cupons

  listCoupons(): Promise<Coupon[]> {
    return this.coupons.findAll();
  }

  /**
   * Valida um código para o aluno e devolve só o desconto e a duração (RF16).
   *
   * Sem isto o seletor de planos não teria como recalcular a parcela na hora —
   * o valor só apareceria depois de contratar, que é tarde demais para decidir.
   * A rota é autenticada e exige o código exato: quem chama já digitou o cupom,
   * então não há tabela de descontos sendo exposta.
   */
  async validateCoupon(code: string): Promise<{
    code: string;
    discountAmount: number;
    durationMonths: number | null;
  }> {
    const resolved = await this.resolveCoupon(code);
    return {
      code: resolved.code,
      discountAmount: resolved.discount,
      durationMonths: resolved.remaining,
    };
  }

  async createCoupon(dto: CreateCouponDto, userId: string): Promise<Coupon> {
    const code = normalizeCouponCode(dto.code);
    if (await this.coupons.findByCode(code)) {
      throw new BadRequestException('Já existe um cupom com esse código');
    }
    return this.coupons.create(
      new Coupon({
        id: randomUUID(),
        code,
        discountAmount: round2(dto.discountAmount),
        durationMonths: dto.durationMonths ?? null,
        active: true,
        createdAt: new Date().toISOString(),
        createdBy: userId,
      }),
    );
  }

  async toggleCoupon(id: string, active: boolean): Promise<Coupon> {
    const coupon = await this.coupons.findById(id);
    if (!coupon) {
      throw new NotFoundException('Cupom não encontrado');
    }
    coupon.active = active;
    await this.coupons.update(coupon);
    return coupon;
  }

  // ------------------------------------------------------------ internos

  /**
   * Espelha plano e situação no documento do aluno (Task 17) e deriva o
   * `isPaying` do status da assinatura (Task 18).
   *
   * **Retrocompatibilidade:** só mexemos no `isPaying` de quem tem assinatura.
   * Aluno que nunca contratou um plano segue com o booleano que a gerente
   * marca à mão, exatamente como antes — não há migração forçada (§3).
   */
  private async syncUser(subscription: Subscription): Promise<void> {
    try {
      await this.users.updateSubscriptionState(subscription.studentId, {
        subscriptionPlan: subscription.plan,
        subscriptionStatus: subscription.status,
        isPaying: grantsAccess(subscription.status),
      });
    } catch (error) {
      // O espelho é conveniência de listagem; a assinatura já está gravada.
      // Falhar aqui não pode derrubar a contratação nem o webhook.
      this.logger.error(
        `Falha ao espelhar assinatura de ${subscription.studentId}: ${String(error)}`,
      );
    }
  }

  private async requireSubscription(studentId: string): Promise<Subscription> {
    const subscription = await this.subscriptions.findByStudent(studentId);
    if (!subscription) {
      throw new NotFoundException('Nenhum plano contratado');
    }
    return subscription;
  }

  private async resolveCoupon(code: string): Promise<ResolvedCoupon> {
    const coupon = await this.coupons.findByCode(code);
    if (!coupon || !coupon.active) {
      throw new BadRequestException('Cupom inválido ou expirado');
    }
    return {
      code: coupon.code,
      discount: coupon.discountAmount,
      remaining: coupon.durationMonths,
    };
  }

  /**
   * Monta a assinatura e o cronograma. O plano mensal é recorrente: ele tem
   * uma parcela conceitual (a mensalidade) mas o cronograma projeta as
   * próximas renovações, para o aluno enxergar as datas à frente (§2).
   */
  private buildSubscription(
    studentId: string,
    plan: SubscriptionPlan,
    paymentMethod: PaymentMethod,
    coupon: ResolvedCoupon | null,
    today: string = todayInAppTimezone(),
  ): Subscription {
    const config = planConfig(plan);
    const scheduled = config.recurring
      ? RECURRING_SCHEDULE_MONTHS
      : config.installments;

    const charges: Charge[] = [];
    for (let index = 1; index <= scheduled; index++) {
      const discounted = this.amountFor(
        config.installmentAmount,
        coupon,
        index,
      );
      charges.push({
        index,
        dueDate: addMonths(today, index - 1),
        amount: discounted,
        status: CHARGE_STATUS.PENDING,
      });
    }

    const now = new Date().toISOString();
    return new Subscription({
      id: studentId,
      studentId,
      plan,
      status: SUBSCRIPTION_STATUS.PENDING,
      paymentMethod,
      totalAmount: config.recurring
        ? config.totalAmount
        : round2(charges.reduce((sum, charge) => sum + charge.amount, 0)),
      installments: config.installments,
      installmentAmount: charges[0].amount,
      paidInstallments: 0,
      charges,
      startDate: today,
      nextChargeDate: charges[0].dueDate,
      couponCode: coupon?.code,
      couponDiscount: coupon?.discount,
      couponRemainingCharges: coupon ? coupon.remaining : undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Valor da parcela `index` já com o cupom, respeitando a duração dele. */
  private amountFor(
    base: number,
    coupon: ResolvedCoupon | null,
    index: number,
  ): number {
    if (!coupon) return base;
    const covered = coupon.remaining === null || index <= coupon.remaining;
    return covered ? applyDiscount(base, coupon.discount) : base;
  }

  /**
   * O gateway cria o pagador junto da cobrança e exige CPF e celular. Sem
   * eles a chamada morre lá dentro e volta como falha genérica de checkout,
   * longe do campo que a causou — o aluno via "erro ao contratar" e não tinha
   * como saber o que fazer (spec 013 Task 45.3).
   *
   * A checagem fica antes de qualquer gravação: barrar depois de salvar a
   * assinatura deixaria um plano `PENDING` sem cobrança emitida.
   */
  private assertPayableProfile(student: User): void {
    const missing: string[] = [];
    if (!student.cpf) missing.push('CPF');
    if (!student.phone) missing.push('celular');
    if (missing.length === 0) return;

    throw new BadRequestException(
      `Complete seu perfil com ${missing.join(' e ')} em Meu Perfil antes de contratar um plano.`,
    );
  }

  /**
   * Emite a próxima cobrança pendente no gateway. Parcela zerada por cupom não
   * vai ao gateway (ele exige valor mínimo de R$ 1) — é confirmada na hora,
   * porque não há o que cobrar.
   */
  private async issueCharge(
    subscription: Subscription,
    email: string,
    customer: { name?: string; cellphone?: string; taxId?: string },
  ): Promise<Partial<ChoosePlanResponseDto>> {
    const charge = this.nextPendingCharge(subscription);
    if (!charge) return {};

    if (charge.amount <= 0) {
      await this.confirmCharge(subscription, undefined, charge.index);
      return {};
    }

    const isPix = subscription.paymentMethod === PAYMENT_METHODS.PIX_RECURRING;
    if (!(isPix ? this.pix : this.card).isEnabled()) {
      return {
        warning:
          'Pagamento indisponível no momento. O plano foi registrado e a cobrança será emitida em breve.',
      };
    }

    // **O cartão não é cobrado aqui, e é a inversão que a migração trouxe.**
    // O token nasce no navegador, no formulário do gateway, e só existe depois
    // que o aluno digita o cartão — que é depois desta chamada. Então a
    // contratação apenas grava o plano e devolve o que a tela precisa para
    // abrir o formulário; quem cobra é `payWithCard`.
    //
    // O caminho anterior conseguia cobrar aqui porque abria uma *sessão* e
    // delegava o formulário ao provedor. Sem redirecionamento e com tokenização
    // no cliente, a ordem se inverte.
    if (!isPix) {
      const config = planConfig(subscription.plan);
      return {
        card: {
          amount: subscription.totalAmount,
          // Do catálogo, nunca do cliente: é o mesmo valor que o backend vai
          // exigir na cobrança, e mandá-lo daqui é o que permite ao formulário
          // travar o seletor de parcelas na opção certa.
          installments: config.installments,
          chargeIndex: charge.index,
        },
      };
    }

    try {
      const charged = await this.pix.createPixCharge(
        this.chargeRequest(subscription, charge, email, customer),
      );
      charge.gatewayChargeId = charged.id;
      charge.gatewayProvider = GATEWAY_PROVIDERS.MERCADOPAGO;
      await this.subscriptions.save(subscription);
      return {
        pixQrCodeUrl: charged.brCodeBase64,
        pixCopyPaste: charged.brCode,
      };
    } catch (error) {
      // O plano já está gravado: falhar aqui derrubaria a contratação inteira
      // por um problema do gateway. O aluno reemite pela própria tela.
      this.logger.error(
        `Falha ao emitir cobrança de ${subscription.studentId}: ${String(error)}`,
      );
      return {
        warning:
          'Não foi possível gerar a cobrança agora. Tente novamente em instantes.',
      };
    }
  }

  /**
   * O pedido que vai ao gateway, comum ao PIX e ao cartão.
   *
   * O valor entra no `externalId` de propósito, e a razão sobrevive à troca de
   * provedor: a criação é idempotente por essa chave, então um aluno que
   * cancela um plano e contrata outro reusaria `aluno-1` e seria cobrado pelo
   * preço do plano anterior. Com os centavos na chave, reusar só acontece
   * quando cobrar de novo é exatamente o mesmo que cobrar — e aí a
   * idempotência vira proteção contra cobrança dobrada.
   */
  private chargeRequest(
    subscription: Subscription,
    charge: Charge,
    email: string,
    customer: { name?: string; cellphone?: string; taxId?: string },
  ) {
    const config = planConfig(subscription.plan);
    return {
      amount: charge.amount,
      description: `${config.label} — parcela ${charge.index}`,
      externalId: `${subscription.studentId}-${charge.index}-${toCents(charge.amount)}`,
      customer: { email, ...customer },
      product: { key: subscription.plan, label: `Plano ${config.label}` },
    };
  }

  /**
   * Encerra a assinatura recorrente no gateway e solta o vínculo do nosso lado.
   *
   * Falhar lá fora **não** impede o cancelamento aqui: deixar o aluno preso
   * num plano por causa de um erro de rede é pior que uma assinatura órfã no
   * painel, que a gerente resolve à mão. O log é o que torna a órfã visível.
   */
  private async releaseGatewaySubscription(
    subscription: Subscription,
  ): Promise<void> {
    const gatewayId = subscription.gatewaySubscriptionId;
    if (!gatewayId) return;

    try {
      await this.card.cancelSubscription(gatewayId);
    } catch (error) {
      this.logger.error(
        `Assinatura ${gatewayId} de ${subscription.studentId} não pôde ser cancelada no gateway: ${String(error)}`,
      );
    }
    subscription.gatewaySubscriptionId = undefined;
  }

  /**
   * O cupom gravado na assinatura, no formato que o gateway de cartão espera.
   * `undefined` quando não há cupom — mandar um `discounts` vazio é recusado.
   */
  private couponFor(subscription: Subscription) {
    if (!subscription.couponCode || !subscription.couponDiscount) {
      return undefined;
    }
    return {
      code: subscription.couponCode,
      amountOff: subscription.couponDiscount,
      durationMonths: subscription.couponRemainingCharges ?? null,
    };
  }

  private nextPendingCharge(subscription: Subscription): Charge | undefined {
    return subscription.charges
      .filter((charge) => charge.status !== CHARGE_STATUS.PAID)
      .sort((a, b) => a.index - b.index)[0];
  }

  /**
   * Marca a parcela como paga e ativa a assinatura. Idempotente: o gateway
   * reenvia o webhook até receber 200, e reprocessar não pode contar a mesma
   * parcela duas vezes.
   */
  private async confirmCharge(
    subscription: Subscription,
    gatewayChargeId?: string,
    index?: number,
  ): Promise<void> {
    const charge = subscription.charges.find((item) =>
      gatewayChargeId
        ? item.gatewayChargeId === gatewayChargeId
        : item.index === index,
    );
    if (!charge || charge.status === CHARGE_STATUS.PAID) return;

    const now = new Date().toISOString();
    charge.status = CHARGE_STATUS.PAID;
    charge.paidAt = now;

    subscription.paidInstallments = subscription.charges.filter(
      (item) => item.status === CHARGE_STATUS.PAID,
    ).length;
    subscription.status = SUBSCRIPTION_STATUS.ACTIVE;
    subscription.updatedAt = now;

    this.extendRecurringSchedule(subscription);

    const next = this.nextPendingCharge(subscription);
    subscription.nextChargeDate = next?.dueDate;

    await this.subscriptions.save(subscription);
    await this.syncUser(subscription);
  }

  /**
   * O plano mensal não acaba: sempre que uma renovação é paga, projetamos mais
   * uma no fim da fila para a janela de meses à frente continuar cheia.
   */
  private extendRecurringSchedule(subscription: Subscription): void {
    if (!planConfig(subscription.plan).recurring) return;

    const pending = subscription.charges.filter(
      (charge) => charge.status !== CHARGE_STATUS.PAID,
    );
    if (pending.length >= RECURRING_SCHEDULE_MONTHS) return;

    const last = subscription.charges[subscription.charges.length - 1];
    const coupon =
      subscription.couponCode && subscription.couponDiscount
        ? {
            code: subscription.couponCode,
            discount: subscription.couponDiscount,
            remaining: subscription.couponRemainingCharges ?? null,
          }
        : null;

    for (let i = pending.length; i < RECURRING_SCHEDULE_MONTHS; i++) {
      const index = subscription.charges.length + 1;
      subscription.charges.push({
        index,
        dueDate: addMonths(last.dueDate, index - last.index),
        amount: this.amountFor(
          planConfig(subscription.plan).installmentAmount,
          coupon,
          index,
        ),
        status: CHARGE_STATUS.PENDING,
      });
    }
  }
}

/**
 * Soma meses a uma data 'YYYY-MM-DD' preservando o dia. Dia 31 em mês curto
 * cai no último dia do mês (31/jan + 1 mês = 28/fev), que é o comportamento
 * esperado de mensalidade — `Date.UTC` sozinho estouraria para março.
 */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
