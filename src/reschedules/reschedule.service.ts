import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RescheduleRepository } from './reschedule.repository';
import { LessonRepository } from '../lessons/lesson.repository';
import { LessonAccessService } from '../lessons/lesson-access.service';
import { ADVANCE_NOTICE_HOURS } from '../lessons/lesson-access.service';
import {
  LESSON_ORIGIN,
  LESSON_STATUS,
  Lesson,
  lessonDocId,
} from '../lessons/lesson.entity';
import {
  RESCHEDULE_KIND,
  RESCHEDULE_STATUS,
  RescheduleKind,
  RescheduleRequest,
} from './reschedule.entity';
import { CreateRescheduleDto } from './dto/create-reschedule.dto';
import { ROLES } from '../types/role';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { nextDateForDayOfWeek, zonedDateTimeToUtc } from '../common/time';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class RescheduleService {
  private readonly logger = new Logger(RescheduleService.name);

  constructor(
    private readonly rescheduleRepository: RescheduleRepository,
    private readonly lessonRepository: LessonRepository,
    private readonly access: LessonAccessService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Solicitação da professora. `planned` exige 4 h de antecedência; `no_show`
   * é a confirmação da remarcação sugerida depois de uma ausência.
   * As duas caem na mesma fila da gerente.
   */
  async request(
    user: AuthenticatedUser,
    lessonId: string,
    dto: CreateRescheduleDto,
    now: Date = new Date(),
  ): Promise<RescheduleRequest> {
    const lesson = await this.getLesson(lessonId);
    this.assertOwnership(user, lesson);

    const kind = this.resolveKind(lesson, now);

    if (kind === RESCHEDULE_KIND.PLANNED && !this.access.hasAdvanceNotice(lesson, now)) {
      throw new BadRequestException(
        `O reagendamento precisa de ao menos ${ADVANCE_NOTICE_HOURS}h de antecedência`,
      );
    }

    const pending = await this.rescheduleRepository.findPendingByLesson(lessonId);
    if (pending) {
      throw new BadRequestException(
        'Já existe uma solicitação aguardando aprovação para esta aula',
      );
    }

    await this.assertProposedSlotFree(
      lesson.teacherId,
      dto.proposedDate,
      dto.proposedHour,
    );

    const created = await this.rescheduleRepository.create(
      new RescheduleRequest({
        lessonId: lesson.id,
        teacherId: lesson.teacherId,
        teacherName: lesson.teacherName,
        studentId: lesson.studentId,
        studentName: lesson.studentName,
        kind,
        originalStartAt: lesson.startAt,
        proposedDate: dto.proposedDate,
        proposedHour: dto.proposedHour,
        reasonType: dto.reasonType,
        reasonText: dto.reasonText,
        status: RESCHEDULE_STATUS.PENDING,
        requesterId: user.sub,
        requesterRole: user.role,
        requestedAt: now.toISOString(),
      }),
    );

    await this.notifications.rescheduleRequested(created);
    return created;
  }

  /**
   * Remarcação sugerida após ausência não avisada: mesma dupla e mesmo
   * horário, na próxima semana livre. A professora ainda precisa confirmar
   * com justificativa (Q1).
   */
  async suggestForNoShow(
    user: AuthenticatedUser,
    lessonId: string,
    now: Date = new Date(),
  ): Promise<{ proposedDate: string; proposedHour: number; kind: RescheduleKind }> {
    const lesson = await this.getLesson(lessonId);
    this.assertOwnership(user, lesson);

    let date = nextDateForDayOfWeek(lesson.date, new Date(lesson.startAt).getUTCDay());
    date = await this.firstFreeDate(lesson.teacherId, date, lesson.hour);

    return {
      proposedDate: date,
      proposedHour: lesson.hour,
      kind: this.resolveKind(lesson, now),
    };
  }

  async listPending(user: AuthenticatedUser): Promise<RescheduleRequest[]> {
    const pending = await this.rescheduleRepository.findByStatus(RESCHEDULE_STATUS.PENDING);
    if (user.role === ROLES.MANAGER) {
      return pending;
    }
    return pending.filter((r) => r.teacherId === user.sub);
  }

  async listStudentRequests(user: AuthenticatedUser): Promise<RescheduleRequest[]> {
    const pending = await this.rescheduleRepository.findByStatus(RESCHEDULE_STATUS.PENDING);
    // Professor só vê pedidos dos seus alunos
    return pending.filter(
      (r) => r.teacherId === user.sub && r.requesterRole === ROLES.STUDENT,
    );
  }

  listMine(teacherId: string): Promise<RescheduleRequest[]> {
    return this.rescheduleRepository.findByTeacher(teacherId);
  }

  /**
   * Aprovação: a aula original vira ausência da professora (não faturável) e
   * nasce a aula remarcada, que será paga quando acontecer.
   */
  async approve(
    user: AuthenticatedUser,
    requestId: string,
    note?: string,
    now: Date = new Date(),
  ): Promise<{ request: RescheduleRequest; lesson: Lesson }> {
    const request = await this.getPendingRequest(requestId);
    const lesson = await this.getLesson(request.lessonId);

    await this.assertProposedSlotFree(
      request.teacherId,
      request.proposedDate,
      request.proposedHour,
    );

    lesson.status = LESSON_STATUS.TEACHER_ABSENCE;
    lesson.payable = false;

    const rescheduled = new Lesson({
      id: lessonDocId(
        request.teacherId,
        request.studentId ?? 'turma',
        request.proposedDate,
        request.proposedHour,
      ),
      teacherId: request.teacherId,
      teacherName: request.teacherName,
      studentId: request.studentId,
      studentName: request.studentName,
      date: request.proposedDate,
      hour: request.proposedHour,
      startAt: zonedDateTimeToUtc(
        request.proposedDate,
        request.proposedHour,
      ).toISOString(),
      origin: LESSON_ORIGIN.RESCHEDULED,
      status: LESSON_STATUS.SCHEDULED,
      rescheduledFromId: lesson.id,
    });

    lesson.rescheduledToId = rescheduled.id;
    await this.lessonRepository.save(rescheduled);
    await this.lessonRepository.save(lesson);

    request.status = RESCHEDULE_STATUS.APPROVED;
    request.decidedAt = now.toISOString();
    request.decidedBy = user.sub;
    request.decisionNote = note;
    request.createdLessonId = rescheduled.id;
    await this.rescheduleRepository.save(request);

    this.logger.log(
      `Reagendamento ${request.id} aprovado: aula ${lesson.id} → ${rescheduled.id}`,
    );
    await this.notifications.rescheduleDecided(request, true);
    return { request, lesson: rescheduled };
  }

  /** Recusa: a aula original continua de pé como estava. */
  async reject(
    user: AuthenticatedUser,
    requestId: string,
    note?: string,
    now: Date = new Date(),
  ): Promise<RescheduleRequest> {
    const request = await this.getPendingRequest(requestId);

    request.status = RESCHEDULE_STATUS.REJECTED;
    request.decidedAt = now.toISOString();
    request.decidedBy = user.sub;
    request.decisionNote = note;
    await this.rescheduleRepository.save(request);

    await this.notifications.rescheduleDecided(request, false);
    return request;
  }

  private resolveKind(lesson: Lesson, now: Date): RescheduleKind {
    // Aula que já passou da janela sem a professora entrar = ausência.
    const missedByTeacher =
      this.access.isPastWindow(lesson, now) && !lesson.teacherJoinedAt;
    return missedByTeacher ? RESCHEDULE_KIND.NO_SHOW : RESCHEDULE_KIND.PLANNED;
  }

  private async getLesson(lessonId: string): Promise<Lesson> {
    const lesson = await this.lessonRepository.findById(lessonId);
    if (!lesson) {
      throw new NotFoundException('Aula não encontrada');
    }
    return lesson;
  }

  private async getPendingRequest(id: string): Promise<RescheduleRequest> {
    const request = await this.rescheduleRepository.findById(id);
    if (!request) {
      throw new NotFoundException('Solicitação não encontrada');
    }
    if (request.status !== RESCHEDULE_STATUS.PENDING) {
      throw new BadRequestException('Esta solicitação já foi decidida');
    }
    return request;
  }

  private assertOwnership(user: AuthenticatedUser, lesson: Lesson): void {
    if (user.role === ROLES.MANAGER) return;
    if (user.role === ROLES.TEACHER && lesson.teacherId === user.sub) return;
    throw new ForbiddenException('Sem acesso a esta aula');
  }

  private async assertProposedSlotFree(
    teacherId: string,
    date: string,
    hour: number,
  ): Promise<void> {
    if (await this.isSlotTaken(teacherId, date, hour)) {
      throw new BadRequestException(
        'A professora já tem aula nesse dia e horário',
      );
    }
  }

  private async isSlotTaken(
    teacherId: string,
    date: string,
    hour: number,
  ): Promise<boolean> {
    const lessons = await this.lessonRepository.findByRange(date, date, teacherId);
    return lessons.some(
      (lesson) =>
        lesson.hour === hour &&
        lesson.status !== LESSON_STATUS.CANCELLED &&
        lesson.status !== LESSON_STATUS.TEACHER_ABSENCE,
    );
  }

  private async firstFreeDate(
    teacherId: string,
    startDate: string,
    hour: number,
  ): Promise<string> {
    let date = startDate;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (!(await this.isSlotTaken(teacherId, date, hour))) {
        return date;
      }
      date = nextDateForDayOfWeek(date, new Date(`${date}T00:00:00Z`).getUTCDay());
    }
    return date;
  }
}
