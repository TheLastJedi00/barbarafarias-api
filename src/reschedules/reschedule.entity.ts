export const RESCHEDULE_KIND = {
  /** Solicitado com antecedência mínima de 4 h. */
  PLANNED: 'planned',
  /** Confirmação da remarcação sugerida após ausência não avisada. */
  NO_SHOW: 'no_show',
} as const;

export type RescheduleKind =
  (typeof RESCHEDULE_KIND)[keyof typeof RESCHEDULE_KIND];

export const RESCHEDULE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type RescheduleStatus =
  (typeof RESCHEDULE_STATUS)[keyof typeof RESCHEDULE_STATUS];

/** Motivos classificados (Q1) — "outro" exige descrição. */
export const REASON_TYPES = {
  SAUDE: 'saude',
  IMPREVISTO: 'imprevisto',
  PESSOAL: 'pessoal',
  OUTRO: 'outro',
} as const;

export type ReasonType = (typeof REASON_TYPES)[keyof typeof REASON_TYPES];

/**
 * Solicitação de reagendamento da professora. Planejada ou pós-ausência,
 * ambas passam pela mesma fila de aprovação da gerente (spec 010 §6.6/§6.7).
 */
export class RescheduleRequest {
  id!: string;
  lessonId!: string;
  teacherId!: string;
  teacherName?: string;
  studentId?: string;
  studentName?: string;
  kind!: RescheduleKind;
  originalStartAt!: string;
  proposedDate!: string;
  proposedHour!: number;
  reasonType!: ReasonType;
  reasonText?: string;
  status!: RescheduleStatus;
  requestedAt!: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionNote?: string;
  createdLessonId?: string;

  constructor(data: Partial<RescheduleRequest>) {
    Object.assign(this, data);
  }
}
