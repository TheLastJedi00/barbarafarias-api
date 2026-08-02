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
import { PaymentGateway } from './payment.gateway';
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
import { Coupon, applyDiscount, normalizeCouponCode, round2 } from './coupon.entity';
import {
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

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly coupons: CouponRepository,
    private readonly users: UserRepository,
    private readonly gateway: PaymentGateway,
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
    });

    return {
      subscription: new SubscriptionDto(subscription),
      paymentMethod: subscription.paymentMethod,
      ...payment,
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
    if (subscription.paymentMethod === dto.paymentMethod) {
      return {
        subscription: new SubscriptionDto(subscription),
        paymentMethod: subscription.paymentMethod,
      };
    }

    subscription.paymentMethod = dto.paymentMethod;
    subscription.updatedAt = new Date().toISOString();

    const student = await this.users.findById(studentId);
    // A cobrança em aberto perde o vínculo com o gateway antigo antes de ser
    // reemitida — sem isso o webhook do PIX abandonado ainda a marcaria paga.
    const pending = this.nextPendingCharge(subscription);
    if (pending) {
      pending.abacatePayId = undefined;
    }

    await this.subscriptions.save(subscription);
    const payment = await this.issueCharge(subscription, student?.email ?? '', {
      name: student?.fullName,
      cellphone: student?.phone,
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
   * Confirmação de pagamento vinda do AbacatePay. O segredo chega na query
   * (`?webhookSecret=`), como manda a documentação do gateway, porque a rota é
   * pública — é a única barreira entre um POST anônimo e uma assinatura ativa.
   */
  async handleWebhook(
    payload: Record<string, any>,
    secret?: string,
  ): Promise<{ received: boolean }> {
    const expected = this.configService.get<string>(
      'ABACATEPAY_WEBHOOK_SECRET',
    );
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Webhook não autorizado');
    }

    const chargeId = extractChargeId(payload);
    if (!chargeId) {
      this.logger.warn(
        `Webhook sem id de cobrança reconhecível: ${JSON.stringify(payload).slice(0, 300)}`,
      );
      return { received: true };
    }

    if (!isPaidEvent(payload)) {
      // Só o pagamento nos interessa hoje. Estorno e expiração ficam para a
      // dívida técnica D1 — devolver 200 evita retentativa infinita.
      return { received: true };
    }

    const subscription = await this.subscriptions.findByChargeId(chargeId);
    if (!subscription) {
      this.logger.warn(`Cobrança ${chargeId} sem assinatura correspondente`);
      return { received: true };
    }

    await this.confirmCharge(subscription, chargeId);
    return { received: true };
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
    if (pending.abacatePayId && this.gateway.isEnabled()) {
      await this.gateway.simulatePayment(pending.abacatePayId);
    }

    await this.confirmCharge(subscription, pending.abacatePayId, pending.index);
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
      const discounted = this.amountFor(config.installmentAmount, coupon, index);
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
        : round2(
            charges.reduce((sum, charge) => sum + charge.amount, 0),
          ),
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
   * Emite a próxima cobrança pendente no gateway. Parcela zerada por cupom não
   * vai ao gateway (ele exige valor mínimo de R$ 1) — é confirmada na hora,
   * porque não há o que cobrar.
   */
  private async issueCharge(
    subscription: Subscription,
    email: string,
    customer: { name?: string; cellphone?: string },
  ): Promise<Partial<ChoosePlanResponseDto>> {
    const charge = this.nextPendingCharge(subscription);
    if (!charge) return {};

    if (charge.amount <= 0) {
      await this.confirmCharge(subscription, undefined, charge.index);
      return {};
    }

    if (!this.gateway.isEnabled()) {
      return {
        warning:
          'Pagamento indisponível no momento. O plano foi registrado e a cobrança será emitida em breve.',
      };
    }

    const request = {
      amount: charge.amount,
      description: `${planConfig(subscription.plan).label} — parcela ${charge.index}`,
      externalId: `${subscription.studentId}-${charge.index}`,
      customer: { email, ...customer },
    };

    try {
      if (subscription.paymentMethod === PAYMENT_METHODS.PIX_RECURRING) {
        const pix = await this.gateway.createPixCharge(request);
        charge.abacatePayId = pix.id;
        await this.subscriptions.save(subscription);
        return { pixQrCodeUrl: pix.brCodeBase64, pixCopyPaste: pix.brCode };
      }

      const checkout = await this.gateway.createCheckout(request);
      charge.abacatePayId = checkout.id;
      await this.subscriptions.save(subscription);
      return { checkoutUrl: checkout.url };
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

  private nextPendingCharge(subscription: Subscription): Charge | undefined {
    return subscription.charges
      .filter((charge) => charge.status !== CHARGE_STATUS.PAID)
      .sort((a, b) => a.index - b.index)[0];
  }

  /**
   * Marca a parcela como paga e ativa a assinatura. Idempotente: o AbacatePay
   * reenvia o webhook até receber 200, e reprocessar não pode contar a mesma
   * parcela duas vezes.
   */
  private async confirmCharge(
    subscription: Subscription,
    abacatePayId?: string,
    index?: number,
  ): Promise<void> {
    const charge = subscription.charges.find((item) =>
      abacatePayId ? item.abacatePayId === abacatePayId : item.index === index,
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

/** O AbacatePay aninha o id em lugares diferentes conforme o tipo da cobrança. */
function extractChargeId(payload: Record<string, any>): string | undefined {
  const data = payload?.data ?? {};
  return (
    data.pixQrCode?.id ??
    data.billing?.id ??
    data.payment?.id ??
    data.id ??
    payload?.id
  );
}

/** Evento de pagamento confirmado, por nome ou pelo status da cobrança. */
function isPaidEvent(payload: Record<string, any>): boolean {
  const event: string = payload?.event ?? '';
  if (event.endsWith('.paid') || event === 'billing.paid') return true;

  const data = payload?.data ?? {};
  const status = data.pixQrCode?.status ?? data.billing?.status ?? data.status;
  return status === 'PAID';
}
