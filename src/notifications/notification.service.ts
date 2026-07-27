import { Injectable, Logger } from '@nestjs/common';
import { ResendService } from './resend.service';
import { templates } from './templates';
import { UserRepository } from '../users/user.repository';
import { Lesson } from '../lessons/lesson.entity';
import { RescheduleRequest } from '../reschedules/reschedule.entity';
import { ROLES } from '../types/role';

/**
 * Traduz eventos de negócio em e-mails. Nunca lança: qualquer falha aqui é
 * registrada e engolida para não derrubar a transação que a originou.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly resend: ResendService,
    private readonly userRepository: UserRepository,
  ) {}

  async rescheduleRequested(request: RescheduleRequest): Promise<void> {
    await this.safeSend(async () => {
      const managers = await this.managerEmails();
      return { to: managers, ...templates.rescheduleRequested(request) };
    });
  }

  async rescheduleDecided(
    request: RescheduleRequest,
    approved: boolean,
  ): Promise<void> {
    await this.safeSend(async () => {
      const to = await this.emailsOf([request.teacherId, request.studentId]);
      return { to, ...templates.rescheduleDecided(request, approved) };
    });
  }

  async lessonMissed(lesson: Lesson, makeup?: Lesson): Promise<void> {
    await this.safeSend(async () => {
      const to = [
        ...(await this.emailsOf([lesson.studentId])),
        ...(await this.managerEmails()),
      ];
      return { to, ...templates.lessonMissed(lesson, makeup) };
    });
  }

  async studentCancelled(lesson: Lesson, makeup?: Lesson): Promise<void> {
    await this.safeSend(async () => {
      const to = [
        ...(await this.emailsOf([lesson.teacherId])),
        ...(await this.managerEmails()),
      ];
      return { to, ...templates.studentCancelled(lesson, makeup) };
    });
  }

  async makeupPushed(makeup: Lesson): Promise<void> {
    await this.safeSend(async () => {
      const to = [
        ...(await this.emailsOf([makeup.studentId])),
        ...(await this.managerEmails()),
      ];
      return { to, ...templates.makeupPushed(makeup) };
    });
  }

  async studentsPendingTeacher(
    teacherName: string,
    studentNames: string[],
  ): Promise<void> {
    if (studentNames.length === 0) return;
    await this.safeSend(async () => ({
      to: await this.managerEmails(),
      ...templates.studentsPendingTeacher(teacherName, studentNames),
    }));
  }

  private async safeSend(
    build: () => Promise<{ to: string[]; subject: string; html: string }>,
  ): Promise<void> {
    try {
      const message = await build();
      await this.resend.send(message);
    } catch (error) {
      this.logger.error(`Falha ao montar notificação: ${String(error)}`);
    }
  }

  private async emailsOf(ids: (string | undefined)[]): Promise<string[]> {
    const users = await Promise.all(
      ids.filter(Boolean).map((id) => this.userRepository.findById(id!)),
    );
    return users
      .map((user) => user?.email)
      .filter((email): email is string => !!email);
  }

  private async managerEmails(): Promise<string[]> {
    const managers = await this.userRepository.findAll(ROLES.MANAGER);
    return managers
      .map((manager) => manager.email)
      .filter((email): email is string => !!email);
  }
}
