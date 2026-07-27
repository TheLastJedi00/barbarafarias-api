export const LESSON_STATUS = {
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  STUDENT_NO_SHOW: 'student_no_show',
  STUDENT_CANCELLED: 'student_cancelled',
  TEACHER_ABSENCE: 'teacher_absence',
  CANCELLED: 'cancelled',
} as const;

export type LessonStatus = (typeof LESSON_STATUS)[keyof typeof LESSON_STATUS];

export const LESSON_ORIGIN = {
  REGULAR: 'regular',
  MAKEUP: 'makeup',
  RESCHEDULED: 'rescheduled',
} as const;

export type LessonOrigin = (typeof LESSON_ORIGIN)[keyof typeof LESSON_ORIGIN];

export interface LessonAttendance {
  present: boolean;
  markedBy: string;
  markedAt: string;
  source: 'auto' | 'manual';
}

export interface LessonRating {
  stars: number; // 1..5
  comment?: string;
  ratedAt: string;
}

/**
 * Aula datada — o "fato" correspondente ao contrato recorrente da agenda.
 * Presença, avaliação, reposição, visão mensal e financeiro se apoiam aqui.
 * Duração fixa de 60 minutos (spec 010 §5.5).
 */
export class Lesson {
  id!: string;
  teacherId!: string;
  teacherName?: string;
  studentId?: string;
  studentName?: string;
  turmaId?: string;
  turmaName?: string;
  date!: string; // 'YYYY-MM-DD' no fuso da operação
  hour!: number; // 8..20
  startAt!: string; // ISO — instante absoluto
  origin!: LessonOrigin;
  status!: LessonStatus;
  rescheduledFromId?: string;
  rescheduledToId?: string;
  studentJoinedAt?: string;
  teacherJoinedAt?: string;
  attendance?: LessonAttendance;
  rating?: LessonRating;
  rateApplied?: number;
  payable?: boolean;

  constructor(data: Partial<Lesson>) {
    Object.assign(this, data);
  }

  /** Aula de turma vale 1 hora, independentemente do número de alunos. */
  get isTurma(): boolean {
    return !!this.turmaId;
  }
}

/** docId determinístico: reexecutar a materialização nunca duplica aula. */
export function lessonDocId(
  teacherId: string,
  occupantId: string,
  date: string,
  hour: number,
): string {
  return `${teacherId}_${occupantId}_${date}_${hour}`;
}
