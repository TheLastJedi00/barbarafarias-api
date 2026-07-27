import { Injectable, Logger } from '@nestjs/common';
import { LessonRepository } from './lesson.repository';
import { UserRepository } from '../users/user.repository';
import {
  LESSON_ORIGIN,
  LESSON_STATUS,
  Lesson,
  lessonDocId,
} from './lesson.entity';
import { addDays, nextDateForDayOfWeek, zonedDateTimeToUtc } from '../common/time';

export interface MakeupResult {
  lesson?: Lesson;
  /** Empurrada por conflito no slot de reposição (avisar aluno e gerente). */
  pushed: boolean;
  /** Motivo de não ter reagendado, quando não houve reposição. */
  skipped?: 'turma' | 'sem-slot' | 'ja-reagendada';
}

/** Quantas semanas à frente tentamos antes de desistir do slot. */
const MAX_WEEKS_AHEAD = 8;

@Injectable()
export class MakeupService {
  private readonly logger = new Logger(MakeupService.name);

  constructor(
    private readonly lessonRepository: LessonRepository,
    private readonly userRepository: UserRepository,
  ) {}

  /**
   * Cria a reposição da aula perdida no slot pré-combinado pela gerente.
   * Slot ocupado → empurra para a semana seguinte e sinaliza (spec 010 §6.5).
   * Aula de turma não gera reposição (Q5).
   */
  async createMakeup(lesson: Lesson): Promise<MakeupResult> {
    if (lesson.turmaId || !lesson.studentId) {
      return { pushed: false, skipped: 'turma' };
    }
    if (lesson.rescheduledToId) {
      return { pushed: false, skipped: 'ja-reagendada' };
    }

    const student = await this.userRepository.findById(lesson.studentId);
    const slot = student?.makeupSlot;
    if (!slot) {
      this.logger.warn(
        `Aluno ${lesson.studentId} sem slot de reposição: aula ${lesson.id} não foi reagendada`,
      );
      return { pushed: false, skipped: 'sem-slot' };
    }

    let date = nextDateForDayOfWeek(lesson.date, slot.dayOfWeek);
    let pushed = false;

    for (let attempt = 0; attempt < MAX_WEEKS_AHEAD; attempt++) {
      const id = lessonDocId(lesson.teacherId, lesson.studentId, date, slot.hour);
      const clash = await this.lessonRepository.findByRange(date, date, lesson.teacherId);
      const taken = clash.some(
        (existing) =>
          existing.hour === slot.hour &&
          existing.status !== LESSON_STATUS.CANCELLED,
      );

      if (!taken) {
        const makeup = new Lesson({
          id,
          teacherId: lesson.teacherId,
          teacherName: lesson.teacherName,
          studentId: lesson.studentId,
          studentName: lesson.studentName,
          date,
          hour: slot.hour,
          startAt: zonedDateTimeToUtc(date, slot.hour).toISOString(),
          origin: LESSON_ORIGIN.MAKEUP,
          status: LESSON_STATUS.SCHEDULED,
          rescheduledFromId: lesson.id,
        });
        await this.lessonRepository.save(makeup);

        lesson.rescheduledToId = makeup.id;
        await this.lessonRepository.save(lesson);

        return { lesson: makeup, pushed };
      }

      date = addDays(date, 7);
      pushed = true;
    }

    this.logger.warn(
      `Sem slot livre de reposição para o aluno ${lesson.studentId} nas próximas ${MAX_WEEKS_AHEAD} semanas`,
    );
    return { pushed: true, skipped: 'sem-slot' };
  }
}
