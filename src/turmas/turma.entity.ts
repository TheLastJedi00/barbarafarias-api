import type { GroupTierId } from './turma-schedule';

export type { GroupTierId } from './turma-schedule';

/**
 * Estado da turma em formação (spec 036). "Em andamento" não é estado: é
 * `CONFIRMED` com o start no passado — um estado a mais exigiria um cron só
 * para trocá-lo.
 */
export const TURMA_STATUS = {
  FORMING: 'FORMING',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;

export type TurmaStatus = (typeof TURMA_STATUS)[keyof typeof TURMA_STATUS];

/** Um adiamento do start, para aluno e gerente entenderem a data. */
export interface StartChange {
  from: string;
  to: string;
  at: string;
  by: string;
}

/** Turma em formação: os campos da spec 036, todos ausentes nas antigas. */
export interface FormingFields {
  tierId?: GroupTierId;
  /** 0 = domingo, como a agenda. */
  dayOfWeek?: number;
  /** Decimal: `19.5` = 19:30. */
  hour?: number;
  /** Só no grupo mensal: as duas semanas do mês (1 a 4). */
  weeksOfMonth?: number[];
  /** Só no grupo mensal: qual das duas é com a fundadora. */
  founderWeek?: number;
  /** A fundadora que conduz a semana dela (a gerente que criou a turma). */
  founderId?: string;
  founderName?: string;
  /** 'YYYY-MM-DD', compatível com o calendário da turma. */
  startDate?: string;
  minStudents?: number;
  maxStudents?: number;
  status?: TurmaStatus;
  confirmedAt?: string;
  cancelledAt?: string;
  startHistory?: StartChange[];
  /** Aviso de 7 dias antes do start já enviado à gerente (idempotência). */
  reminderSentAt?: string;
  /** Aviso de mínimo atingido já enviado (idempotência). */
  minReachedNotifiedAt?: string;
  createdAt?: string;
}

/** Valores-padrão da spec 036. */
export const DEFAULT_MIN_STUDENTS = 5;
export const DEFAULT_MAX_STUDENTS = 8;

export class Turma implements FormingFields {
  id?: string;
  name: string;
  studentIds: string[];
  studentNames: string[];
  teacherId?: string;
  teacherName?: string;
  meetUrl?: string;

  tierId?: GroupTierId;
  dayOfWeek?: number;
  hour?: number;
  weeksOfMonth?: number[];
  founderWeek?: number;
  founderId?: string;
  founderName?: string;
  startDate?: string;
  minStudents?: number;
  maxStudents?: number;
  status?: TurmaStatus;
  confirmedAt?: string;
  cancelledAt?: string;
  startHistory?: StartChange[];
  reminderSentAt?: string;
  minReachedNotifiedAt?: string;
  createdAt?: string;

  constructor(
    name: string,
    studentIds: string[],
    studentNames: string[],
    id?: string,
    extras: Partial<
      Pick<Turma, 'teacherId' | 'teacherName' | 'meetUrl'> & FormingFields
    > = {},
  ) {
    this.name = name;
    this.studentIds = studentIds;
    this.studentNames = studentNames;
    if (id) this.id = id;
    Object.assign(this, extras);
  }
}

/** Turma da spec 036 (vendida por tier, com calendário próprio)? */
export function hasTierCalendar(turma: FormingFields): boolean {
  return !!turma.tierId;
}
