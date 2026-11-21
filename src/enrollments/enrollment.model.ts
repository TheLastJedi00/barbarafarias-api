import type { GroupTierId } from '../turmas/turma-schedule';
import type {
  PaymentMethod,
  TierPlan,
} from '../subscriptions/subscription.entity';

/**
 * Matrícula numa turma em formação (spec 036 §3): a vaga reservada com o
 * **sinal**, que depois é abatido do plano.
 *
 * - `PENDING`: aceitou o termo, o sinal ainda não caiu.
 * - `PAID`: sinal pago, vaga ocupada.
 * - `CONVERTED`: a turma foi confirmada e a matrícula virou plano.
 * - `REFUNDED`: sinal devolvido (desistência, turma cancelada ou adiada).
 * - `CANCELLED`: encerrada sem dinheiro envolvido (não pagou, trocou de meio).
 */
export const ENROLLMENT_STATUS = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  CONVERTED: 'CONVERTED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
} as const;

export type EnrollmentStatus =
  (typeof ENROLLMENT_STATUS)[keyof typeof ENROLLMENT_STATUS];

export type EnrollmentRefundBy = 'student' | 'manager' | 'turma-cancelled';

export interface Enrollment {
  id: string;
  studentId: string;
  /** Para a lista da gerente sem cruzar coleção. */
  studentName: string;
  turmaId: string;
  tierId: GroupTierId;
  /** Como o aluno vai pagar o plano quando a turma fechar. */
  mode: TierPlan;
  /** Do **sinal**: PIX ou cartão à vista. */
  paymentMethod: PaymentMethod;
  /** Sinal congelado na matrícula. */
  feeAmount: number;
  /** Validado na matrícula, aplicado no plano na confirmação. */
  couponCode?: string;
  status: EnrollmentStatus;
  gateway: { orderId?: string };
  termsVersion: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  convertedAt?: string;
  refundedAt?: string;
  cancelledAt?: string;
  refund?: { by: EnrollmentRefundBy; at: string; reason?: string };
  /** Assinatura criada na confirmação (spec 036 §5). */
  subscriptionStudentId?: string;
  /**
   * Início da turma na conversão: o mês em que o sinal vira receita no
   * Financeiro (spec 036 §5), junto com o plano.
   */
  startDate?: string;
}

/** Viva = ainda ocupa (ou pode ocupar) a vaga. Uma por aluno. */
export function isLiveEnrollment(enrollment: Pick<Enrollment, 'status'>) {
  return (
    enrollment.status === ENROLLMENT_STATUS.PENDING ||
    enrollment.status === ENROLLMENT_STATUS.PAID
  );
}

/** Conta para o mínimo e para o máximo: só quem pagou. */
export function countsForSeat(enrollment: Pick<Enrollment, 'status'>) {
  return (
    enrollment.status === ENROLLMENT_STATUS.PAID ||
    enrollment.status === ENROLLMENT_STATUS.CONVERTED
  );
}

/** Referência do sinal no gateway (`external_reference`). */
export function enrollmentReference(enrollmentId: string): string {
  return `enrollment:${enrollmentId}`;
}

/** Desistência do sinal: dias a partir do pagamento (CDC art. 49). */
export const ENROLLMENT_WITHDRAWAL_DAYS = 7;
