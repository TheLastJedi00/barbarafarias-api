import { Injectable, Logger } from '@nestjs/common';
import { ResendService } from './resend.service';
import { templates } from './templates';
import { UserRepository } from '../users/user.repository';
import { Lesson } from '../lessons/lesson.entity';
import { RescheduleRequest } from '../reschedules/reschedule.entity';
import { ROLES } from '../types/role';
import type { ApplicationStatus } from '../recruitment/application.model';

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

  /** Nova candidatura no Trabalhe Conosco (spec 028): avisa as gerentes. */
  async applicationReceived(
    jobTitle: string,
    candidateName: string,
  ): Promise<void> {
    await this.safeSend(async () => ({
      to: await this.managerEmails(),
      ...templates.applicationReceived(jobTitle, candidateName),
    }));
  }

  /**
   * Mudança de etapa: vai direto ao e-mail do candidato, que não está em
   * `users` (spec 028).
   */
  async applicationStatusChanged(
    email: string,
    candidateName: string,
    jobTitle: string,
    status: ApplicationStatus,
  ): Promise<void> {
    await this.safeSend(() =>
      Promise.resolve({
        to: [email],
        ...templates.applicationStatusChanged(candidateName, jobTitle, status),
      }),
    );
  }

  /**
   * Compra paga na loja (spec 032): confirmação para o comprador e aviso de
   * venda para as gerentes. São dois envios, e a falha de um não segura o outro.
   */
  async storePurchasePaid(purchase: {
    userId: string;
    titleSnapshot: string;
    priceSnapshot: number;
    accessUntil?: string;
  }): Promise<void> {
    const buyer = await this.safeFind(purchase.userId);
    const accessUntil = purchase.accessUntil;
    if (buyer?.email && accessUntil) {
      await this.safeSend(() =>
        Promise.resolve({
          to: [buyer.email],
          ...templates.storePurchaseConfirmed(
            buyer.fullName ?? '',
            purchase.titleSnapshot,
            accessUntil,
          ),
        }),
      );
    }
    await this.safeSend(async () => ({
      to: await this.managerEmails(),
      ...templates.storeSale(
        buyer?.fullName ?? 'Um comprador',
        purchase.titleSnapshot,
        purchase.priceSnapshot,
      ),
    }));
  }

  /** Compra devolvida (spec 032). Na desistência, as gerentes também sabem. */
  async storePurchaseRefunded(purchase: {
    userId: string;
    titleSnapshot: string;
    refund?: { by: 'buyer' | 'manager' | 'gateway' };
  }): Promise<void> {
    const by = purchase.refund?.by ?? 'gateway';
    const buyer = await this.safeFind(purchase.userId);
    if (buyer?.email) {
      await this.safeSend(() =>
        Promise.resolve({
          to: [buyer.email],
          ...templates.storePurchaseRefunded(
            buyer.fullName ?? '',
            purchase.titleSnapshot,
            by,
          ),
        }),
      );
    }
    if (by === 'buyer') {
      await this.safeSend(async () => ({
        to: await this.managerEmails(),
        ...templates.storeWithdrawal(
          buyer?.fullName ?? 'Um comprador',
          purchase.titleSnapshot,
        ),
      }));
    }
  }

  // ------------------------------------------------ turmas (spec 036)

  async enrollmentPaid(
    studentId: string,
    turma: { name: string; startDate?: string },
    missing: number,
  ): Promise<void> {
    const student = await this.safeFind(studentId);
    if (!student?.email || !turma.startDate) return;
    await this.safeSend(() =>
      Promise.resolve({
        to: [student.email],
        ...templates.enrollmentPaid(
          student.fullName ?? '',
          turma.name,
          turma.startDate!,
          missing,
        ),
      }),
    );
  }

  async enrollmentRefunded(
    studentId: string,
    turma: { name: string },
    reason: 'student' | 'manager' | 'turma-cancelled' | 'overbooked',
  ): Promise<void> {
    const student = await this.safeFind(studentId);
    if (!student?.email) return;
    await this.safeSend(() =>
      Promise.resolve({
        to: [student.email],
        ...(reason === 'turma-cancelled'
          ? templates.turmaCancelled(student.fullName ?? '', turma.name)
          : templates.enrollmentRefunded(
              student.fullName ?? '',
              turma.name,
              reason,
            )),
      }),
    );
  }

  async turmaMinimumReached(
    turma: { name: string; startDate?: string; minStudents?: number },
    paid: number,
  ): Promise<void> {
    await this.safeSend(async () => ({
      to: await this.managerEmails(),
      ...templates.turmaMinimumReached(
        turma.name,
        paid,
        turma.minStudents ?? 0,
        turma.startDate ?? '',
      ),
    }));
  }

  async turmaStartReminder(
    turma: { name: string; startDate?: string; minStudents?: number },
    paid: number,
  ): Promise<void> {
    await this.safeSend(async () => ({
      to: await this.managerEmails(),
      ...templates.turmaStartReminder(
        turma.name,
        paid,
        turma.minStudents ?? 0,
        turma.startDate ?? '',
      ),
    }));
  }

  async turmaConfirmed(
    studentId: string,
    turma: { name: string; startDate?: string },
  ): Promise<void> {
    const student = await this.safeFind(studentId);
    if (!student?.email || !turma.startDate) return;
    await this.safeSend(() =>
      Promise.resolve({
        to: [student.email],
        ...templates.turmaConfirmed(
          student.fullName ?? '',
          turma.name,
          turma.startDate!,
        ),
      }),
    );
  }

  async turmaPostponed(
    studentId: string,
    turma: { name: string },
    from: string,
    to: string,
  ): Promise<void> {
    const student = await this.safeFind(studentId);
    if (!student?.email) return;
    await this.safeSend(() =>
      Promise.resolve({
        to: [student.email],
        ...templates.turmaPostponed(
          student.fullName ?? '',
          turma.name,
          from,
          to,
        ),
      }),
    );
  }

  private async safeFind(id: string) {
    try {
      return await this.userRepository.findById(id);
    } catch (error) {
      this.logger.error(`Falha ao ler o usuário ${id}: ${String(error)}`);
      return null;
    }
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
