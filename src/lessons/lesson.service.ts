import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ROLES } from '../types/role';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { LessonRepository } from './lesson.repository';
import { AgendaService } from '../agenda/agenda.service';
import {
  LESSON_ORIGIN,
  LESSON_STATUS,
  Lesson,
  LessonStatus,
  lessonDocId,
} from './lesson.entity';
import { AccessState, LessonAccessService } from './lesson-access.service';
import { UserRepository } from '../users/user.repository';
import { TurmaRepository } from '../turmas/turma.repository';
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
    private readonly access: LessonAccessService,
    private readonly userRepository: UserRepository,
    private readonly turmaRepository: TurmaRepository,
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

  /** Aulas do período, já materializadas, ordenadas cronologicamente. */
  async findRange(
    user: AuthenticatedUser,
    from: string,
    to: string,
    requestedTeacherId?: string,
  ): Promise<Lesson[]> {
    const teacherId = this.agendaService.resolveScope(user, requestedTeacherId);
    await this.ensureLessons(from, to, teacherId);
    const lessons = await this.lessonRepository.findByRange(from, to, teacherId);
    return this.sorted(lessons);
  }

  /** Aulas do dia — alimenta o painel "Aulas de hoje" da gerente. */
  async findByDate(date: string): Promise<Lesson[]> {
    await this.ensureLessons(date, date);
    return this.sorted(await this.lessonRepository.findByDate(date));
  }

  /** Aulas do aluno: as dele e as das turmas a que pertence. */
  async findByStudent(
    studentId: string,
    from: string,
    to: string,
  ): Promise<Lesson[]> {
    await this.ensureLessons(from, to);
    const [individual, all] = await Promise.all([
      this.lessonRepository.findByStudent(studentId, from, to),
      this.lessonRepository.findByRange(from, to),
    ]);

    const turmaIds = new Set(
      (await this.agendaService.getStudentTurmaIds(studentId)) ?? [],
    );
    const group = all.filter(
      (lesson) => lesson.turmaId && turmaIds.has(lesson.turmaId),
    );

    const byId = new Map<string, Lesson>();
    for (const lesson of [...individual, ...group]) {
      byId.set(lesson.id, lesson);
    }
    return this.sorted([...byId.values()]);
  }

  async findById(id: string): Promise<Lesson> {
    const lesson = await this.lessonRepository.findById(id);
    if (!lesson) {
      throw new NotFoundException('Aula não encontrada');
    }
    return lesson;
  }

  /** Professora dona da aula (ou gerente) pode operá-la. */
  assertOwnership(user: AuthenticatedUser, lesson: Lesson): void {
    if (user.role === ROLES.MANAGER) return;
    if (user.role === ROLES.TEACHER && lesson.teacherId === user.sub) return;
    throw new ForbiddenException('Sem acesso a esta aula');
  }

  /**
   * Estado da janela + link da sala. O link só sai daqui quando a janela está
   * aberta: o aluno nunca recebe a URL no HTML (spec 010 RNF3).
   */
  async getAccess(
    user: AuthenticatedUser,
    lessonId: string,
    now: Date = new Date(),
  ): Promise<{
    state: AccessState;
    startAt: string;
    meetUrl?: string;
    status: LessonStatus;
  }> {
    const lesson = await this.findById(lessonId);
    const isStudent = await this.isStudentOf(user, lesson);

    if (!isStudent) {
      this.assertOwnership(user, lesson);
      const state = this.access.teacherState(lesson, now);
      if (state === 'open' && !lesson.teacherJoinedAt) {
        lesson.teacherJoinedAt = now.toISOString();
        await this.lessonRepository.save(lesson);
      }
      return {
        state,
        startAt: lesson.startAt,
        status: lesson.status,
        meetUrl: state === 'open' ? await this.resolveMeetUrl(lesson) : undefined,
      };
    }

    const state = this.access.studentState(lesson, now);
    if (state === 'open' && !lesson.studentJoinedAt) {
      lesson.studentJoinedAt = now.toISOString();
      await this.lessonRepository.save(lesson);
    }
    if (state === 'missed' && lesson.status === LESSON_STATUS.SCHEDULED) {
      await this.markStudentNoShow(lesson, now);
    }

    return {
      state,
      startAt: lesson.startAt,
      status: lesson.status,
      meetUrl: state === 'open' ? await this.resolveMeetUrl(lesson) : undefined,
    };
  }

  /** Fecha a aula como falta do aluno (sem aviso) e dispara a reposição. */
  private async markStudentNoShow(lesson: Lesson, now: Date): Promise<void> {
    lesson.status = LESSON_STATUS.STUDENT_NO_SHOW;
    lesson.attendance = {
      present: false,
      markedBy: 'system',
      markedAt: now.toISOString(),
      source: 'auto',
    };
    await this.lessonRepository.save(lesson);
  }

  /** Sala fixa do aluno ou da turma, cadastrada pela gerente. */
  private async resolveMeetUrl(lesson: Lesson): Promise<string | undefined> {
    if (lesson.turmaId) {
      const turma = await this.turmaRepository.findById(lesson.turmaId);
      return turma?.meetUrl;
    }
    if (!lesson.studentId) return undefined;
    const student = await this.userRepository.findById(lesson.studentId);
    return student?.meetUrl;
  }

  private async isStudentOf(
    user: AuthenticatedUser,
    lesson: Lesson,
  ): Promise<boolean> {
    if (user.role !== ROLES.STUDENT) return false;
    if (lesson.studentId === user.sub) return true;
    if (!lesson.turmaId) return false;
    const turmaIds = await this.agendaService.getStudentTurmaIds(user.sub);
    return turmaIds.includes(lesson.turmaId);
  }

  private sorted(lessons: Lesson[]): Lesson[] {
    return lessons.sort(
      (a, b) => a.date.localeCompare(b.date) || a.hour - b.hour,
    );
  }
}
