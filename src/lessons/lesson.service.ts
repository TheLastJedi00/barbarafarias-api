import {
  attachPracticeAverages,
  LessonWithPractice,
  studentIdsOf,
} from './lesson-practice';
import {
  BadRequestException,
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
import {
  AccessState,
  ADVANCE_NOTICE_HOURS,
  LessonAccessService,
  MANUAL_ATTENDANCE_WINDOW_HOURS,
} from './lesson-access.service';
import { UserRepository } from '../users/user.repository';
import { TurmaRepository } from '../turmas/turma.repository';
import { MakeupService } from './makeup.service';
import { NotificationService } from '../notifications/notification.service';
import { BillingService } from '../billing/billing.service';
import {
  datesBetween,
  dayOfWeekOf,
  todayInAppTimezone,
  zonedDateTimeToUtc,
} from '../common/time';
import { TURMA_STATUS, type Turma } from '../turmas/turma.entity';
import { turmaDatesBetween, weekOfMonth } from '../turmas/turma-schedule';

@Injectable()
export class LessonService {
  private readonly logger = new Logger(LessonService.name);

  constructor(
    private readonly lessonRepository: LessonRepository,
    private readonly agendaService: AgendaService,
    private readonly access: LessonAccessService,
    private readonly userRepository: UserRepository,
    private readonly turmaRepository: TurmaRepository,
    private readonly makeupService: MakeupService,
    private readonly notifications: NotificationService,
    private readonly billing: BillingService,
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

    const [slots, turmas] = await Promise.all([
      this.agendaService.getGrid(teacherId),
      this.turmaRepository.findAll(),
    ]);
    // Turma com calendário próprio (spec 036) não sai da grade semanal: o
    // grupo mensal nem cabe nela, e a semanal só existe depois do início.
    const ownCalendar = new Set(
      turmas.filter((turma) => !!turma.tierId).map((turma) => turma.id),
    );

    const candidates: Lesson[] = [
      ...this.turmaLessons(turmas, start, to, teacherId),
    ];
    for (const date of datesBetween(start, to)) {
      const dayOfWeek = dayOfWeekOf(date);
      // Um bloco de 1 hora ocupa DOIS documentos de agenda (spec 011 RF5), mas
      // é UMA aula. Sem filtrar pelo início do bloco, a segunda meia-hora
      // materializaria uma aula gêmea às 08:30 — duplicando presença,
      // reposição e, sobretudo, o repasse no fechamento da gerente.
      for (const slot of slots.filter(
        (s) => s.dayOfWeek === dayOfWeek && s.isBlockStart(),
      )) {
        const occupantId = slot.studentId ?? slot.turmaId;
        if (!slot.teacherId || !occupantId) {
          continue; // slot legado ou incompleto: ignorado até a migração
        }
        if (slot.turmaId && ownCalendar.has(slot.turmaId)) continue;
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

  /**
   * Aulas das turmas com calendário próprio (spec 036 §4): só confirmadas, no
   * dia e horário da turma, a partir do início. No grupo mensal, a semana da
   * fundadora sai com ela como responsável. O id é o mesmo formato da grade,
   * então a materialização continua idempotente.
   */
  private turmaLessons(
    turmas: Turma[],
    from: string,
    to: string,
    teacherId?: string,
  ): Lesson[] {
    const lessons: Lesson[] = [];
    for (const turma of turmas) {
      if (
        !turma.tierId ||
        turma.status !== TURMA_STATUS.CONFIRMED ||
        !turma.startDate ||
        !turma.teacherId ||
        turma.dayOfWeek === undefined ||
        turma.hour === undefined
      ) {
        continue;
      }
      const dates = turmaDatesBetween(
        {
          tierId: turma.tierId,
          dayOfWeek: turma.dayOfWeek,
          weeksOfMonth: turma.weeksOfMonth,
          startDate: turma.startDate,
        },
        from,
        to,
      );
      for (const date of dates) {
        const founderLesson =
          turma.tierId === 'monthly-group' &&
          !!turma.founderId &&
          weekOfMonth(date) === turma.founderWeek;
        const responsible = founderLesson
          ? { id: turma.founderId!, name: turma.founderName }
          : { id: turma.teacherId, name: turma.teacherName };
        if (teacherId && responsible.id !== teacherId) continue;
        lessons.push(
          new Lesson({
            id: lessonDocId(responsible.id, turma.id!, date, turma.hour),
            teacherId: responsible.id,
            teacherName: responsible.name,
            turmaId: turma.id,
            turmaName: turma.name,
            date,
            hour: turma.hour,
            startAt: zonedDateTimeToUtc(date, turma.hour).toISOString(),
            origin: LESSON_ORIGIN.REGULAR,
            status: LESSON_STATUS.SCHEDULED,
          }),
        );
      }
    }
    return lessons;
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
    const lessons = await this.lessonRepository.findByRange(
      from,
      to,
      teacherId,
    );
    return this.withPractice(this.sorted(await this.autoCloseOverdue(lessons)));
  }

  /** Aulas do dia — alimenta o painel "Aulas de hoje" da gerente. */
  async findByDate(date: string): Promise<Lesson[]> {
    await this.ensureLessons(date, date);
    const lessons = await this.lessonRepository.findByDate(date);
    return this.withPractice(this.sorted(await this.autoCloseOverdue(lessons)));
  }

  /**
   * Média dos flashcards de cada aula (spec 037 §5.6), para a professora ver
   * antes de entrar. Uma leitura em lote dos alunos; turmas, uma por turma.
   */
  private async withPractice(lessons: Lesson[]): Promise<LessonWithPractice[]> {
    if (lessons.length === 0) return lessons;
    const turmaIds = [
      ...new Set(
        lessons.map((l) => l.turmaId).filter((id): id is string => !!id),
      ),
    ];
    const turmas = await Promise.all(
      turmaIds.map((id) => this.turmaRepository.findById(id)),
    );
    const turmaStudents = new Map(
      turmaIds.map((id, i) => [id, turmas[i]?.studentIds ?? []]),
    );
    const summaries = await this.userRepository.findPracticeSummaries(
      studentIdsOf(lessons, turmaStudents),
    );
    return attachPracticeAverages(lessons, summaries, turmaStudents);
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
        meetUrl:
          state === 'open' ? await this.resolveMeetUrl(lesson) : undefined,
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

  /**
   * Presença manual da professora — gatilho secundário, disponível por 72 h e
   * soberano sobre o automático (é correção humana).
   */
  async markAttendance(
    user: AuthenticatedUser,
    lessonId: string,
    present: boolean,
    now: Date = new Date(),
  ): Promise<Lesson> {
    const lesson = await this.findById(lessonId);
    this.assertOwnership(user, lesson);

    if (now < new Date(lesson.startAt)) {
      throw new BadRequestException('A aula ainda não começou');
    }
    if (this.access.isPastManualWindow(lesson, now)) {
      throw new BadRequestException(
        `Prazo de ${MANUAL_ATTENDANCE_WINDOW_HOURS}h para marcar presença expirou`,
      );
    }

    lesson.status = present
      ? LESSON_STATUS.COMPLETED
      : LESSON_STATUS.STUDENT_NO_SHOW;
    lesson.attendance = {
      present,
      markedBy: user.sub,
      markedAt: now.toISOString(),
      source: 'manual',
    };
    await this.billing.priceLesson(lesson);
    await this.lessonRepository.save(lesson);

    if (!present) {
      await this.onStudentMissed(lesson);
    }
    return lesson;
  }

  /**
   * Fechamento automático: passadas as 72 h sem marcação manual, valem os
   * gatilhos primários (entrou na sala = presente).
   */
  private async autoCloseOverdue(
    lessons: Lesson[],
    now: Date = new Date(),
  ): Promise<Lesson[]> {
    const overdue = lessons.filter(
      (lesson) =>
        lesson.status === LESSON_STATUS.SCHEDULED &&
        this.access.isPastManualWindow(lesson, now),
    );

    for (const lesson of overdue) {
      const present = !!lesson.studentJoinedAt;
      lesson.status = present
        ? LESSON_STATUS.COMPLETED
        : LESSON_STATUS.STUDENT_NO_SHOW;
      lesson.attendance = {
        present,
        markedBy: 'system',
        markedAt: now.toISOString(),
        source: 'auto',
      };
      await this.billing.priceLesson(lesson);
      await this.lessonRepository.save(lesson);
      if (!present) {
        await this.onStudentMissed(lesson);
      }
    }

    return lessons;
  }

  /** Falta do aluno: gera a reposição no slot pré-combinado (§6.5). */
  private async onStudentMissed(lesson: Lesson): Promise<void> {
    const result = await this.makeupService.createMakeup(lesson);
    await this.notifications.lessonMissed(lesson, result.lesson);
    if (result.pushed) {
      this.logger.warn(
        `Reposição da aula ${lesson.id} empurrada por conflito de slot`,
      );
      if (result.lesson) {
        await this.notifications.makeupPushed(result.lesson);
      }
    }
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
    await this.billing.priceLesson(lesson);
    await this.lessonRepository.save(lesson);
    await this.onStudentMissed(lesson);
  }

  /**
   * Aviso prévio de ausência do aluno (≥ 4 h). A aula é liberada e vai para o
   * slot de reposição; professora e gerente são avisadas (Q4/§6.3).
   */
  async studentCancel(
    user: AuthenticatedUser,
    lessonId: string,
    now: Date = new Date(),
  ): Promise<{ lesson: Lesson; makeup?: Lesson; pushed: boolean }> {
    const lesson = await this.findById(lessonId);

    if (!(await this.isStudentOf(user, lesson))) {
      throw new ForbiddenException('Só o próprio aluno pode avisar a ausência');
    }
    if (lesson.turmaId) {
      throw new BadRequestException(
        'Aula de turma não pode ser cancelada individualmente',
      );
    }
    if (lesson.status !== LESSON_STATUS.SCHEDULED) {
      throw new BadRequestException('Esta aula não está mais agendada');
    }
    if (!this.access.hasAdvanceNotice(lesson, now)) {
      throw new BadRequestException(
        `O aviso precisa ser feito com ao menos ${ADVANCE_NOTICE_HOURS}h de antecedência`,
      );
    }

    lesson.status = LESSON_STATUS.STUDENT_CANCELLED;
    lesson.attendance = {
      present: false,
      markedBy: user.sub,
      markedAt: now.toISOString(),
      source: 'manual',
    };
    await this.billing.priceLesson(lesson);
    await this.lessonRepository.save(lesson);

    const makeup = await this.makeupService.createMakeup(lesson);
    await this.notifications.studentCancelled(lesson, makeup.lesson);
    if (makeup.pushed && makeup.lesson) {
      await this.notifications.makeupPushed(makeup.lesson);
    }
    return { lesson, makeup: makeup.lesson, pushed: makeup.pushed };
  }

  /** Avaliação da aula concluída: 1..5 estrelas + comentário, uma por aula. */
  async rateLesson(
    user: AuthenticatedUser,
    lessonId: string,
    stars: number,
    comment?: string,
    now: Date = new Date(),
  ): Promise<Lesson> {
    const lesson = await this.findById(lessonId);

    if (!(await this.isStudentOf(user, lesson))) {
      throw new ForbiddenException('Só o aluno da aula pode avaliá-la');
    }
    if (lesson.status !== LESSON_STATUS.COMPLETED) {
      throw new BadRequestException('Só é possível avaliar uma aula concluída');
    }
    if (lesson.rating) {
      throw new BadRequestException('Esta aula já foi avaliada');
    }

    lesson.rating = { stars, comment, ratedAt: now.toISOString() };
    await this.lessonRepository.save(lesson);
    return lesson;
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
