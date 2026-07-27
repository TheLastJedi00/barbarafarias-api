import { Injectable } from '@nestjs/common';
import { BillingRepository } from './billing.repository';
import { UserRepository } from '../users/user.repository';
import { BillingSettings } from './billing.entity';
import { LESSON_STATUS, Lesson, LessonStatus } from '../lessons/lesson.entity';

/**
 * A professora é paga por **hora contratada sob a responsabilidade dela**.
 * Só não recebe quando **ela** não entrega a aula (spec 010 §6.8):
 * falta, aviso prévio ou reposição do aluno não reduzem o que ela ganha —
 * espelha a mensalidade que o aluno paga assistindo ou não.
 */
export function isPayable(status: LessonStatus): boolean {
  return (
    status === LESSON_STATUS.COMPLETED ||
    status === LESSON_STATUS.STUDENT_NO_SHOW ||
    status === LESSON_STATUS.STUDENT_CANCELLED
  );
}

/** Explicação legível do porquê a aula entra (ou não) no fechamento. */
export function payableReason(status: LessonStatus): string {
  switch (status) {
    case LESSON_STATUS.COMPLETED:
      return 'Aula dada';
    case LESSON_STATUS.STUDENT_NO_SHOW:
      return 'Aluno faltou sem avisar';
    case LESSON_STATUS.STUDENT_CANCELLED:
      return 'Aluno avisou a ausência';
    case LESSON_STATUS.TEACHER_ABSENCE:
      return 'Ausência da professora (não paga)';
    case LESSON_STATUS.CANCELLED:
      return 'Aula cancelada (não paga)';
    default:
      return 'Aula ainda agendada';
  }
}

@Injectable()
export class BillingService {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly userRepository: UserRepository,
  ) {}

  getSettings(): Promise<BillingSettings> {
    return this.billingRepository.getSettings();
  }

  async updateSettings(
    defaultHourlyRate: number,
    updatedBy: string,
    now: Date = new Date(),
  ): Promise<BillingSettings> {
    const settings = new BillingSettings({
      defaultHourlyRate,
      updatedAt: now.toISOString(),
      updatedBy,
    });
    await this.billingRepository.saveSettings(settings);
    return settings;
  }

  /** Valor-hora vigente da professora: o dela, ou o global. */
  async resolveRate(teacherId: string): Promise<number> {
    const [teacher, settings] = await Promise.all([
      this.userRepository.findById(teacherId),
      this.billingRepository.getSettings(),
    ]);
    return teacher?.hourlyRate ?? settings.defaultHourlyRate;
  }

  /**
   * Congela o valor no fechamento da aula: mudar o valor-hora depois não
   * altera o que já foi apurado (RF19).
   */
  async priceLesson(lesson: Lesson): Promise<Lesson> {
    lesson.payable = isPayable(lesson.status);
    if (lesson.payable && lesson.rateApplied === undefined) {
      lesson.rateApplied = await this.resolveRate(lesson.teacherId);
    }
    return lesson;
  }
}
