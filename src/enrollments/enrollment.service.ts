import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { NotificationService } from '../notifications/notification.service';
import { ContractService } from '../contracts/contract.service';
import { PlanTierService } from '../plan-tiers/plan-tier.service';
import { opensEnrollment, type PlanTier } from '../plan-tiers/plan-tier.model';
import { SubscriptionRepository } from '../subscriptions/subscription.repository';
import {
  CARD_REJECTED_MESSAGE,
  SubscriptionService,
} from '../subscriptions/subscription.service';
import {
  PAYMENT_METHODS,
  SUBSCRIPTION_STATUS,
  TIER_PLANS,
  type TierPlan,
} from '../subscriptions/subscription.entity';
import {
  GatewayBusyError,
  GatewayConflictError,
  GatewayRejectedError,
} from '../subscriptions/mercadopago.gateway';
import {
  CHARGE_OUTCOMES,
  CardGateway,
  PixGateway,
  type ChargeOutcome,
  type CheckoutResult,
  type PaymentGateway,
} from '../subscriptions/payment.gateway';
import {
  ORDER_STATUS,
  isOrderPaid,
  type OrderStatusPair,
} from '../subscriptions/mercadopago.status';
import { TurmaRepository } from '../turmas/turma.repository';
import { Turma, TURMA_STATUS } from '../turmas/turma.entity';
import { addDays, todayInAppTimezone, toZonedDateString } from '../common/time';
import { formatSlotHour } from '../common/slot-time';
import type { User } from '../users/user.entity';
import { UserRepository } from '../users/user.repository';
import {
  ENROLLMENT_STATUS,
  ENROLLMENT_WITHDRAWAL_DAYS,
  Enrollment,
  countsForSeat,
  enrollmentReference,
  isLiveEnrollment,
} from './enrollment.model';
import { EnrollmentRepository } from './enrollment.repository';
import {
  ENROLLMENT_TERMS_VERSION,
  buildEnrollmentTerms,
  type EnrollmentTerms,
} from './enrollment-terms';
import type {
  CreateEnrollmentDto,
  EnrollmentCardDto,
} from './dto/enrollment.dto';

/** O que a tela recebe ao matricular: o pagamento que ela precisa abrir. */
export interface CreateEnrollmentResponse {
  enrollment: Enrollment;
  pixQrCodeUrl?: string;
  pixCopyPaste?: string;
  /** Cartão: valor à vista para o Brick. A cobrança nasce no `POST me/card`. */
  card?: { amount: number; installments: 1 };
  warning?: string;
}

export interface EnrollmentCardResponse {
  enrollment: Enrollment;
  outcome: ChargeOutcome;
  challengeUrl?: string;
  warning?: string;
}

/** Uma turma aberta na vitrine pública: nada de quem já se matriculou. */
export interface OpenTurma {
  id: string;
  name: string;
  tierId: string;
  dayOfWeek: number;
  hour: number;
  weeksOfMonth?: number[];
  startDate: string;
  teacherName?: string;
  minStudents: number;
  seatsLeft: number;
  enrollmentFee: number;
}

/** A matrícula do aluno com a turma, para o Meu Plano (espera). */
export interface MyEnrollmentView {
  enrollment: Enrollment;
  turma: {
    id: string;
    name: string;
    tierId?: string;
    dayOfWeek?: number;
    hour?: number;
    startDate?: string;
    status?: string;
    minStudents?: number;
    maxStudents?: number;
    paid: number;
    teacherName?: string;
    startHistory: { from: string; to: string; at: string }[];
  };
  /** Até quando dá para desistir do sinal, ou `null` se não dá. */
  withdrawUntil: string | null;
}

const DIAS = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
];
const brl = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (date: string) => date.split('-').reverse().join('/');
const now = () => new Date().toISOString();

/**
 * Matrícula numa turma em formação (spec 036 §1, §3, §5): o aceite do termo
 * gera o contrato, o sinal é cobrado à vista e, pago, ocupa a vaga.
 *
 * As regras de cobrança são as da loja e da spec 023: **o webhook confirma**,
 * a tela só pergunta; antes de cobrar no cartão de novo, confere se a
 * tentativa anterior não passou; e o estorno sai pelo gateway de origem.
 */
@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly turmas: TurmaRepository,
    private readonly planTiers: PlanTierService,
    private readonly users: UserRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly subscriptionService: SubscriptionService,
    private readonly pix: PixGateway,
    private readonly card: CardGateway,
    private readonly contracts: ContractService,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
  ) {}

  // ------------------------------------------------------------- termo

  async terms(turmaId: string, mode: TierPlan): Promise<EnrollmentTerms> {
    const turma = await this.requireOpenTurma(turmaId);
    const tier = await this.requireEnrollableTier(turma);
    this.assertMode(tier, mode);
    return buildEnrollmentTerms(turma, tier, mode);
  }

  // --------------------------------------------------------- matrícula

  async create(
    requester: AuthenticatedUser,
    dto: CreateEnrollmentDto,
  ): Promise<CreateEnrollmentResponse> {
    const turma = await this.requireOpenTurma(dto.turmaId);
    const tier = await this.requireEnrollableTier(turma);
    this.assertMode(tier, dto.mode);

    if (dto.acceptance.termsVersion !== ENROLLMENT_TERMS_VERSION) {
      throw new ConflictException(
        'O termo de matrícula foi atualizado. Leia a versão nova e aceite de novo.',
      );
    }

    const student = await this.requireStudent(requester.sub);
    assertPayable(student);
    await this.assertNoLivePlan(requester.sub);

    const mine = await this.enrollments.findByStudent(requester.sub);
    if (mine.some((e) => e.status === ENROLLMENT_STATUS.PAID)) {
      throw new ConflictException(
        'Você já tem uma matrícula paga. Acompanhe a turma em Meu Plano.',
      );
    }
    await this.assertSeat(turma);

    const couponCode = await this.validateCoupon(dto, tier);

    // Uma pendente por aluno. Mesma turma e mesmo meio: reaproveita (o PIX
    // devolve o mesmo QR pela chave de idempotência). Senão, a antiga é
    // encerrada — se a order dela ainda cair, o webhook a reativa.
    const pending = mine.find((e) => e.status === ENROLLMENT_STATUS.PENDING);
    let enrollment: Enrollment;
    if (
      pending &&
      pending.turmaId === turma.id &&
      pending.paymentMethod === dto.paymentMethod
    ) {
      enrollment = {
        ...pending,
        mode: dto.mode,
        couponCode,
        termsVersion: dto.acceptance.termsVersion,
        updatedAt: now(),
      };
    } else {
      if (pending) await this.cancelPending(pending);
      const at = now();
      enrollment = {
        id: this.enrollments.newId(),
        studentId: requester.sub,
        studentName: student.fullName,
        turmaId: turma.id!,
        tierId: turma.tierId!,
        mode: dto.mode,
        paymentMethod: dto.paymentMethod,
        feeAmount: tier.enrollmentFee!,
        couponCode,
        status: ENROLLMENT_STATUS.PENDING,
        gateway: {},
        termsVersion: dto.acceptance.termsVersion,
        createdAt: at,
        updatedAt: at,
      };
    }
    await this.enrollments.save(enrollment);
    await this.recordContract(enrollment, student, turma, tier);

    if (dto.paymentMethod === PAYMENT_METHODS.CREDIT_CARD) {
      return {
        enrollment,
        card: { amount: enrollment.feeAmount, installments: 1 },
        ...(this.card.isEnabled()
          ? {}
          : {
              warning: 'Pagamento indisponível no momento. Tente mais tarde.',
            }),
      };
    }
    return this.issuePix(enrollment, student, turma);
  }

  /** Cobra o sinal no cartão com o token do Brick, à vista. */
  async payWithCard(
    requester: AuthenticatedUser,
    dto: EnrollmentCardDto,
  ): Promise<EnrollmentCardResponse> {
    const enrollment = await this.requireLive(requester.sub);
    if (enrollment.paymentMethod !== PAYMENT_METHODS.CREDIT_CARD) {
      throw new BadRequestException('Esta matrícula não é no cartão.');
    }
    if (enrollment.status === ENROLLMENT_STATUS.PAID) {
      return { enrollment, outcome: CHARGE_OUTCOMES.PAID };
    }
    if (!this.card.isEnabled()) {
      throw new ServiceUnavailableException(
        'Pagamento indisponível no momento. Tente mais tarde.',
      );
    }

    // Antes de cobrar, ver se a tentativa anterior não passou (spec 023).
    if (enrollment.gateway.orderId) {
      const previous = await this.card.fetchChargeOutcome(
        enrollment.gateway.orderId,
      );
      if (previous.outcome === CHARGE_OUTCOMES.PAID) {
        return {
          enrollment: await this.markPaid(enrollment),
          outcome: CHARGE_OUTCOMES.PAID,
        };
      }
      if (previous.outcome === CHARGE_OUTCOMES.CHALLENGE) {
        return {
          enrollment,
          outcome: CHARGE_OUTCOMES.CHALLENGE,
          challengeUrl: previous.challengeUrl,
        };
      }
    }

    const student = await this.requireStudent(requester.sub);
    const turma = await this.turmas.findById(enrollment.turmaId);
    const label = `Matrícula — ${turma?.name ?? 'turma'}`;
    let checkout: CheckoutResult;
    try {
      checkout = await this.card.createCheckout({
        amount: enrollment.feeAmount,
        description: label,
        externalId: enrollmentReference(enrollment.id),
        customer: customerOf(student),
        product: { key: `MATRICULA-${enrollment.turmaId}`, label },
        plan: 'MATRICULA',
        planLabel: label,
        studentId: requester.sub,
        recurring: { cycles: 1 },
        installments: 1,
        card: { token: dto.token, paymentMethodId: dto.paymentMethodId },
      });
    } catch (error) {
      if (error instanceof GatewayConflictError) {
        throw new BadRequestException(
          'Esta cobrança já foi tentada com outros dados. Feche e preencha o cartão novamente.',
        );
      }
      if (error instanceof GatewayRejectedError) {
        throw new BadRequestException(CARD_REJECTED_MESSAGE);
      }
      if (error instanceof GatewayBusyError) {
        return {
          enrollment,
          outcome: CHARGE_OUTCOMES.PENDING,
          warning:
            'O pagamento está congestionado no momento. Tente novamente em instantes.',
        };
      }
      throw error;
    }

    let saved: Enrollment = {
      ...enrollment,
      gateway: { orderId: checkout.id },
      updatedAt: now(),
    };
    await this.enrollments.save(saved);
    if (checkout.outcome === CHARGE_OUTCOMES.PAID) {
      saved = await this.markPaid(saved);
    }
    if (checkout.outcome === CHARGE_OUTCOMES.REJECTED) {
      throw new BadRequestException(CARD_REJECTED_MESSAGE);
    }
    return {
      enrollment: saved,
      outcome: checkout.outcome,
      challengeUrl: checkout.challengeUrl,
    };
  }

  /** Fim do desafio 3DS: relê a order em vez de esperar o webhook. */
  async refreshCard(
    requester: AuthenticatedUser,
  ): Promise<EnrollmentCardResponse> {
    const enrollment = await this.requireLive(requester.sub);
    if (enrollment.status === ENROLLMENT_STATUS.PAID) {
      return { enrollment, outcome: CHARGE_OUTCOMES.PAID };
    }
    if (!enrollment.gateway.orderId || !this.card.isEnabled()) {
      return { enrollment, outcome: CHARGE_OUTCOMES.PENDING };
    }
    const result = await this.card.fetchChargeOutcome(
      enrollment.gateway.orderId,
    );
    return {
      enrollment:
        result.outcome === CHARGE_OUTCOMES.PAID
          ? await this.markPaid(enrollment)
          : enrollment,
      outcome: result.outcome,
      challengeUrl: result.challengeUrl,
    };
  }

  /** Simulação local do PIX. Só com `DEV_MODE=true`. */
  async mockPay(requester: AuthenticatedUser): Promise<Enrollment> {
    if (this.config.get<string>('DEV_MODE') !== 'true') {
      throw new ForbiddenException('Simulação disponível apenas em DEV_MODE');
    }
    const enrollment = await this.requireLive(requester.sub);
    if (enrollment.status !== ENROLLMENT_STATUS.PENDING) {
      throw new BadRequestException('Esta matrícula não está pendente.');
    }
    return this.markPaid(enrollment);
  }

  // -------------------------------------------------------- leitura

  /**
   * Turmas abertas para a vitrine (spec 036 T5): em formação, com início
   * futuro, vaga e tier com matrícula aberta. Conta só matrículas pagas, e
   * não devolve nome de aluno nenhum — a rota é pública.
   */
  async openTurmas(): Promise<OpenTurma[]> {
    const today = todayInAppTimezone();
    const candidates = (await this.turmas.findAll()).filter(
      (turma) =>
        !!turma.tierId &&
        turma.status === TURMA_STATUS.FORMING &&
        !!turma.startDate &&
        turma.startDate > today,
    );
    const tiers = new Map<string, PlanTier>();
    const open: OpenTurma[] = [];
    for (const turma of candidates) {
      if (!tiers.has(turma.tierId!)) {
        tiers.set(
          turma.tierId!,
          await this.planTiers.getEffective(turma.tierId!),
        );
      }
      const tier = tiers.get(turma.tierId!)!;
      if (!opensEnrollment(tier)) continue;
      const paid = (await this.enrollments.findByTurma(turma.id!)).filter(
        countsForSeat,
      ).length;
      const seatsLeft = (turma.maxStudents ?? 0) - paid;
      if (seatsLeft <= 0) continue;
      open.push({
        id: turma.id!,
        name: turma.name,
        tierId: turma.tierId!,
        dayOfWeek: turma.dayOfWeek!,
        hour: turma.hour!,
        ...(turma.weeksOfMonth ? { weeksOfMonth: turma.weeksOfMonth } : {}),
        startDate: turma.startDate!,
        teacherName: turma.teacherName,
        minStudents: turma.minStudents ?? 0,
        seatsLeft,
        enrollmentFee: tier.enrollmentFee!,
      });
    }
    return open.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  /** A matrícula mais recente do aluno, com a turma. `null` sem nenhuma. */
  async mine(requester: AuthenticatedUser): Promise<MyEnrollmentView | null> {
    const mine = await this.enrollments.findByStudent(requester.sub);
    const latest = [...mine].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0];
    if (!latest) return null;
    const turma = await this.turmas.findById(latest.turmaId);
    if (!turma) return null;
    const paid = (await this.enrollments.findByTurma(turma.id!)).filter(
      countsForSeat,
    ).length;
    return {
      enrollment: latest,
      turma: {
        id: turma.id!,
        name: turma.name,
        tierId: turma.tierId,
        dayOfWeek: turma.dayOfWeek,
        hour: turma.hour,
        startDate: turma.startDate,
        status: turma.status,
        minStudents: turma.minStudents,
        maxStudents: turma.maxStudents,
        paid,
        teacherName: turma.teacherName,
        startHistory: (turma.startHistory ?? []).map(({ from, to, at }) => ({
          from,
          to,
          at,
        })),
      },
      withdrawUntil: withdrawUntilOf(latest, turma),
    };
  }

  // --------------------------------------------------------- webhook

  /**
   * A order notificada é de uma matrícula? `false` quando não é, para o
   * webhook seguir adiante. Idempotente: o Mercado Pago reenvia até 2xx.
   */
  async handleOrderEvent(
    orderId: string,
    order: OrderStatusPair,
  ): Promise<boolean> {
    const enrollment = await this.enrollments.findByOrderId(orderId);
    if (!enrollment) return false;

    if (isOrderPaid(order)) {
      if (
        enrollment.status === ENROLLMENT_STATUS.PENDING ||
        enrollment.status === ENROLLMENT_STATUS.CANCELLED
      ) {
        await this.markPaid(enrollment);
      }
      return true;
    }

    switch (order.status) {
      case ORDER_STATUS.REFUNDED:
      case ORDER_STATUS.CHARGED_BACK:
        if (enrollment.status !== ENROLLMENT_STATUS.REFUNDED) {
          await this.enrollments.save({
            ...enrollment,
            status: ENROLLMENT_STATUS.REFUNDED,
            refundedAt: now(),
            refund: enrollment.refund ?? { by: 'manager', at: now() },
            updatedAt: now(),
          });
        }
        return true;
      case ORDER_STATUS.CANCELED:
      case ORDER_STATUS.EXPIRED:
      case ORDER_STATUS.FAILED:
        if (enrollment.status === ENROLLMENT_STATUS.PENDING) {
          await this.cancelPending(enrollment);
        }
        return true;
      default:
        return true;
    }
  }

  // ----------------------------------------------------- desistência

  /**
   * Desistência do aluno (§5): nos 7 dias do pagamento, ou com a turma
   * adiada depois do pagamento, até o novo start. Pendente só se encerra.
   */
  async withdraw(requester: AuthenticatedUser): Promise<Enrollment> {
    const enrollment = await this.requireLive(requester.sub);
    if (enrollment.status === ENROLLMENT_STATUS.PENDING) {
      return this.cancelPending(enrollment);
    }
    const turma = await this.turmas.findById(enrollment.turmaId);
    const until = turma ? withdrawUntilOf(enrollment, turma) : null;
    if (!until || todayInAppTimezone() > until) {
      throw new ConflictException(
        `A desistência com devolução do sinal vale por ${ENROLLMENT_WITHDRAWAL_DAYS} dias a partir do pagamento, ou até o novo início se a turma for adiada.`,
      );
    }
    return this.refund(enrollment, 'student', turma?.name ?? 'turma');
  }

  /**
   * Devolve o sinal pelo gateway de origem. Usado pela desistência e pelo
   * ciclo da turma (cancelada, ou vaga vendida duas vezes).
   */
  async refund(
    enrollment: Enrollment,
    by: 'student' | 'manager' | 'turma-cancelled',
    turmaName: string,
    reasonForEmail?: 'overbooked',
  ): Promise<Enrollment> {
    const gateway = this.gatewayFor(enrollment);
    if (enrollment.gateway.orderId && gateway.isEnabled()) {
      try {
        await gateway.refundOrder(
          enrollment.gateway.orderId,
          enrollmentReference(enrollment.id),
        );
      } catch (error) {
        if (error instanceof GatewayBusyError) {
          throw new ServiceUnavailableException(
            'O estorno está congestionado no momento. Tente novamente em instantes.',
          );
        }
        throw error;
      }
    } else if (this.config.get<string>('DEV_MODE') !== 'true') {
      throw new ServiceUnavailableException(
        'Estorno indisponível no momento. Tente mais tarde.',
      );
    }
    const at = now();
    const refunded: Enrollment = {
      ...enrollment,
      status: ENROLLMENT_STATUS.REFUNDED,
      refundedAt: at,
      refund: { by, at },
      updatedAt: at,
    };
    await this.enrollments.save(refunded);
    await this.notifications.enrollmentRefunded(
      enrollment.studentId,
      { name: turmaName },
      reasonForEmail ?? by,
    );
    return refunded;
  }

  /** Encerra uma pendente (sem dinheiro). */
  async cancelPending(enrollment: Enrollment): Promise<Enrollment> {
    const cancelled: Enrollment = {
      ...enrollment,
      status: ENROLLMENT_STATUS.CANCELLED,
      cancelledAt: now(),
      updatedAt: now(),
    };
    await this.enrollments.save(cancelled);
    return cancelled;
  }

  // ------------------------------------------------------- auxiliares

  /**
   * Sinal confirmado. Se a vaga já tiver sido ocupada por outro pagamento
   * entre a matrícula e a confirmação (corrida na última vaga), o excedente
   * é estornado e a matrícula, cancelada: vender vaga que não existe é o que
   * a turma com máximo existe para impedir.
   */
  private async markPaid(enrollment: Enrollment): Promise<Enrollment> {
    if (enrollment.status === ENROLLMENT_STATUS.PAID) return enrollment;
    const turma = await this.turmas.findById(enrollment.turmaId);
    const paidOthers = turma
      ? (await this.enrollments.findByTurma(turma.id!)).filter(
          (e) => e.id !== enrollment.id && countsForSeat(e),
        ).length
      : 0;

    const at = now();
    const paid: Enrollment = {
      ...enrollment,
      status: ENROLLMENT_STATUS.PAID,
      paidAt: at,
      updatedAt: at,
    };

    const open =
      !!turma &&
      turma.status === TURMA_STATUS.FORMING &&
      paidOthers < (turma.maxStudents ?? Infinity);
    if (!open) {
      this.logger.warn(
        `Sinal da matrícula ${enrollment.id} pago sem vaga: estornando.`,
      );
      await this.enrollments.save(paid);
      const refunded = await this.refund(
        paid,
        'manager',
        turma?.name ?? 'turma',
        'overbooked',
      );
      return refunded;
    }

    await this.enrollments.save(paid);
    const total = paidOthers + 1;
    const min = turma.minStudents ?? 0;
    await this.notifications.enrollmentPaid(
      enrollment.studentId,
      turma,
      Math.max(0, min - total),
    );
    if (total >= min && !turma.minReachedNotifiedAt) {
      await this.notifications.turmaMinimumReached(turma, total);
      await this.turmas.save(
        Object.assign(Object.create(Turma.prototype), turma, {
          minReachedNotifiedAt: at,
        }) as Turma,
      );
    }
    return paid;
  }

  private async issuePix(
    enrollment: Enrollment,
    student: User,
    turma: Turma,
  ): Promise<CreateEnrollmentResponse> {
    if (!this.pix.isEnabled()) {
      return {
        enrollment,
        warning: 'Pagamento indisponível no momento. Tente mais tarde.',
      };
    }
    try {
      const label = `Matrícula — ${turma.name}`;
      const charge = await this.pix.createPixCharge({
        amount: enrollment.feeAmount,
        description: label,
        externalId: enrollmentReference(enrollment.id),
        customer: customerOf(student),
        product: { key: `MATRICULA-${turma.id}`, label },
      });
      const saved: Enrollment = {
        ...enrollment,
        gateway: { orderId: charge.id },
        updatedAt: now(),
      };
      await this.enrollments.save(saved);
      return {
        enrollment: saved,
        pixQrCodeUrl: charge.brCodeBase64,
        pixCopyPaste: charge.brCode,
      };
    } catch (error) {
      this.logger.warn(
        `PIX da matrícula ${enrollment.id} não emitido: ${String(error)}`,
      );
      return {
        enrollment,
        warning:
          'Não foi possível gerar o PIX agora. Tente novamente em instantes.',
      };
    }
  }

  private async recordContract(
    enrollment: Enrollment,
    student: User,
    turma: Turma,
    tier: PlanTier,
  ): Promise<void> {
    const terms = buildEnrollmentTerms(turma, tier, enrollment.mode);
    await this.contracts.recordSafely({
      studentId: enrollment.studentId,
      studentName: student.fullName,
      studentEmail: student.email,
      kind: 'ENROLLMENT',
      refId: enrollment.id,
      title: `Matrícula — ${turma.name}`,
      termsVersion: terms.version,
      summary: terms.summary,
      clauses: terms.clauses,
      deal: [
        { label: 'Plano', value: tier.name },
        {
          label: 'Turma',
          value: `${turma.name} (${DIAS[turma.dayOfWeek ?? 0]}, ${formatSlotHour(turma.hour ?? 0)})`,
        },
        { label: 'Início previsto', value: br(turma.startDate!) },
        {
          label: 'Sinal',
          value: `${brl(enrollment.feeAmount)} à vista, ${enrollment.paymentMethod === PAYMENT_METHODS.PIX_RECURRING ? 'no PIX' : 'no cartão'}`,
        },
        {
          label: 'Plano escolhido',
          value:
            enrollment.mode === TIER_PLANS.PACKAGE
              ? 'Pacote de 6 meses'
              : 'Assinatura mensal com fidelidade de 6 meses',
        },
        ...(enrollment.couponCode
          ? [{ label: 'Cupom', value: enrollment.couponCode }]
          : []),
      ],
      acceptedAt: enrollment.updatedAt,
    });
  }

  /**
   * O cupom é do plano: conferido agora contra o tier e a modalidade, e
   * aplicado na confirmação. A forma de pagamento do plano ainda não existe,
   * então no pacote basta valer numa das duas — a régua final é a da compra.
   */
  private async validateCoupon(
    dto: CreateEnrollmentDto,
    tier: PlanTier,
  ): Promise<string | undefined> {
    const code = dto.couponCode?.trim();
    if (!code) return undefined;
    const methods =
      dto.mode === TIER_PLANS.SUBSCRIPTION
        ? [PAYMENT_METHODS.CREDIT_CARD]
        : [PAYMENT_METHODS.PIX_RECURRING, PAYMENT_METHODS.CREDIT_CARD];
    let lastError: unknown;
    for (const paymentMethod of methods) {
      try {
        const valid = await this.subscriptionService.validateCoupon(code, {
          tierId: tier.id,
          plan: dto.mode,
          paymentMethod,
        });
        return valid.code;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  private async requireOpenTurma(turmaId: string): Promise<Turma> {
    const turma = await this.turmas.findById(turmaId);
    if (!turma || !turma.tierId) {
      throw new NotFoundException('Turma não encontrada.');
    }
    if (
      turma.status !== TURMA_STATUS.FORMING ||
      !turma.startDate ||
      turma.startDate <= todayInAppTimezone()
    ) {
      throw new ConflictException('Esta turma não está aberta para matrícula.');
    }
    return turma;
  }

  private async requireEnrollableTier(turma: Turma): Promise<PlanTier> {
    const tier = await this.planTiers.getEffective(turma.tierId!);
    if (!opensEnrollment(tier)) {
      throw new ConflictException(
        'A matrícula deste plano não está aberta no momento.',
      );
    }
    return tier;
  }

  private assertMode(tier: PlanTier, mode: TierPlan): void {
    if (mode === TIER_PLANS.SUBSCRIPTION && !tier.monthlyPrice) {
      throw new BadRequestException(
        `O plano ${tier.name} não está disponível como assinatura.`,
      );
    }
  }

  private async assertSeat(turma: Turma): Promise<void> {
    const paid = (await this.enrollments.findByTurma(turma.id!)).filter(
      countsForSeat,
    ).length;
    if (paid >= (turma.maxStudents ?? Infinity)) {
      throw new ConflictException('Esta turma já está completa.');
    }
  }

  /** Plano vivo (ativo, pendente ou atrasado) não se matricula em turma. */
  private async assertNoLivePlan(studentId: string): Promise<void> {
    const subscription = await this.subscriptions.findByStudent(studentId);
    if (subscription && subscription.status !== SUBSCRIPTION_STATUS.CANCELLED) {
      throw new ConflictException(
        'Você já tem um plano. Para mudar de plano, fale com a escola.',
      );
    }
  }

  private async requireStudent(id: string): Promise<User> {
    const student = await this.users.findById(id);
    if (!student) throw new NotFoundException('Aluno não encontrado.');
    return student;
  }

  private async requireLive(studentId: string): Promise<Enrollment> {
    const live = (await this.enrollments.findByStudent(studentId)).find(
      isLiveEnrollment,
    );
    if (!live) throw new NotFoundException('Nenhuma matrícula em andamento.');
    return live;
  }

  private gatewayFor(enrollment: Enrollment): PaymentGateway {
    return enrollment.paymentMethod === PAYMENT_METHODS.PIX_RECURRING
      ? this.pix
      : this.card;
  }
}

/**
 * Até quando o aluno pode desistir do sinal pago: 7 dias do pagamento, ou —
 * se a turma foi adiada depois do pagamento — até o novo start. O que for
 * mais tarde. `null` quando não há o que desistir.
 */
export function withdrawUntilOf(
  enrollment: Enrollment,
  turma: Pick<Turma, 'startDate' | 'startHistory' | 'status'>,
): string | null {
  if (enrollment.status === ENROLLMENT_STATUS.PENDING) {
    return todayInAppTimezone();
  }
  if (enrollment.status !== ENROLLMENT_STATUS.PAID || !enrollment.paidAt) {
    return null;
  }
  const byCdc = addDays(
    toZonedDateString(new Date(enrollment.paidAt)),
    ENROLLMENT_WITHDRAWAL_DAYS,
  );
  const postponedAfterPayment = (turma.startHistory ?? []).some(
    (change) => change.at > enrollment.paidAt!,
  );
  if (!postponedAfterPayment || !turma.startDate) return byCdc;
  const untilStart = addDays(turma.startDate, -1);
  return untilStart > byCdc ? untilStart : byCdc;
}

/** CPF e celular antes de chegar ao gateway — sem eles a cobrança é recusada. */
function assertPayable(student: User): void {
  const missing: string[] = [];
  if (!student.cpf) missing.push('CPF');
  if (!student.phone) missing.push('celular');
  if (missing.length === 0) return;
  throw new BadRequestException(
    `Complete seu perfil com ${missing.join(' e ')} antes de pagar a matrícula.`,
  );
}

function customerOf(student: User) {
  return {
    name: student.fullName,
    email: student.email,
    cellphone: student.phone,
    taxId: student.cpf,
  };
}
