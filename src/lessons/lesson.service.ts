import { Injectable, Logger } from '@nestjs/common';
import { LessonRepository } from './lesson.repository';
import { AgendaService } from '../agenda/agenda.service';
import {
  LESSON_ORIGIN,
  LESSON_STATUS,
  Lesson,
  lessonDocId,
} from './lesson.entity';
import {
  datesBetween,
  dayOfWeekOf,
  todayInAppTimezone,
  zonedDateTimeToUtc,
} from '../common/time';

@Injectable()
export class LessonService {
  private readonly logger = new Logger(LessonService.name);

  constructor(
    private readonly lessonRepository: LessonRepository,
    private readonly agendaService: AgendaService,
  ) {}

  /**
   * Materializa as aulas do intervalo a partir da grade recorrente.
   * Idempotente: o docId é determinístico e só o que falta é criado.
   *
   * Nunca materializa o passado — aula que não foi criada no seu dia não é
   * inventada retroativamente (a grade de hoje não descreve a de semanas
   * atrás). Consultas a datas passadas devolvem apenas o que já existe.
   */
  async ensureLessons(
    from: string,
    to: string,
    teacherId?: string,
  ): Promise<number> {
    const start = from < todayInAppTimezone() ? todayInAppTimezone() : from;
    if (start > to) {
      return 0;
    }

    const slots = await this.agendaService.getGrid(teacherId);
    if (slots.length === 0) {
      return 0;
    }

    const candidates: Lesson[] = [];
    for (const date of datesBetween(start, to)) {
      const dayOfWeek = dayOfWeekOf(date);
      for (const slot of slots.filter((s) => s.dayOfWeek === dayOfWeek)) {
        const occupantId = slot.studentId ?? slot.turmaId;
        if (!slot.teacherId || !occupantId) {
          continue; // slot legado ou incompleto: ignorado até a migração
        }
        candidates.push(
          new Lesson({
            id: lessonDocId(slot.teacherId, occupantId, date, slot.hour),
            teacherId: slot.teacherId,
            teacherName: slot.teacherName,
            studentId: slot.studentId,
            studentName: slot.studentName,
            turmaId: slot.turmaId,
            turmaName: slot.turmaName,
            date,
            hour: slot.hour,
            startAt: zonedDateTimeToUtc(date, slot.hour).toISOString(),
            origin: LESSON_ORIGIN.REGULAR,
            status: LESSON_STATUS.SCHEDULED,
          }),
        );
      }
    }

    const created = await this.lessonRepository.createMissing(candidates);
    if (created > 0) {
      this.logger.log(`Materializadas ${created} aulas entre ${start} e ${to}`);
    }
    return created;
  }
}
