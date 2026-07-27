/** Valor-hora padrão: mensalidade de R$ 240 para ~4 aulas/mês. */
export const DEFAULT_HOURLY_RATE = 60;

export class BillingSettings {
  defaultHourlyRate: number;
  currency: string;
  updatedAt?: string;
  updatedBy?: string;

  constructor(data: Partial<BillingSettings> = {}) {
    this.defaultHourlyRate = data.defaultHourlyRate ?? DEFAULT_HOURLY_RATE;
    this.currency = data.currency ?? 'BRL';
    this.updatedAt = data.updatedAt;
    this.updatedBy = data.updatedBy;
  }
}

export interface BillingLine {
  lessonId: string;
  date: string;
  hour: number;
  studentName?: string;
  turmaName?: string;
  status: string;
  origin: string;
  rate: number;
  reason: string;
}

export interface TeacherClosing {
  teacherId: string;
  teacherName: string;
  isManager: boolean;
  pixKey?: string;
  hourlyRate: number;
  payableLessons: number;
  unpayableLessons: number;
  total: number;
}
