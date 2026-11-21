import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { NotificationService } from '../notifications/notification.service';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { TurmaRepository } from '../turmas/turma.repository';
import { Turma, TURMA_STATUS } from '../turmas/turma.entity';
import { isCompatibleStart } from '../turmas/turma-schedule';
import { addDays, todayInAppTimezone } from '../common/time';
import {
  ENROLLMENT_STATUS,
  Enrollment,
  countsForSeat,
} from './enrollment.model';
import { EnrollmentRepository } from './enrollment.repository';
import { EnrollmentService } from './enrollment.service';

export interface FailedStudent {
  studentId: string;
  studentName: string;
  reason: string;
}

export interface ConfirmReport {
  turma: Turma;
  converted: number;
  failed: FailedStudent[];
}

/** Uma linha da Gestão › Turmas: a turma e a contagem das matrículas. */
export interface TurmaOverview {
  turma: Turma;
  paid: number;
  pending: number;
}

export interface CancelReport {
  turma: Turma;
  refunded: number;
  failed: FailedStudent[];
}

/** Quantos dias antes do início a gerente recebe o lembrete. */
export const START_REMINDER_DAYS = 7;

/**
 * O ciclo da turma em formação (spec 036 §1, §5, §7): a gerente confirma,
 * adia ou cancela; o sistema converte em plano, avisa e devolve os sinais.
 *
 * A confirmação é **sempre** da gerente, mesmo com o mínimo atingido: é ela
 * quem sabe se a professora segue disponível. O sistema avisa (mínimo
 * atingido, 7 dias antes do início), não confirma sozinho.
 */
@Injectable()
export class TurmaLifecycleService {
  private readonly logger = new Logger(TurmaLifecycleService.name);

  constructor(
    private readonly turmas: TurmaRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly enrollmentService: EnrollmentService,
    private readonly subscriptions: SubscriptionService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Cada matrícula paga vira plano pendente (preço de hoje, cupom, sinal
   * abatido, início da turma). Abaixo do mínimo, só com `force`: a gerente
   * precisa dizer que viu.
   */
  async confirm(
    turmaId: string,
    options: { force?: boolean },
  ): Promise<ConfirmReport> {
    const turma = await this.requireTurma(turmaId);
    if (turma.status !== TURMA_STATUS.FORMING) {
      throw new ConflictException(
        'Só a turma em formação pode ser confirmada.',
      );
    }
    const all = await this.enrollments.findByTurma(turma.id!);
    const paid = all.filter((e) => e.status === ENROLLMENT_STATUS.PAID);
    const min = turma.minStudents ?? 0;
    if (paid.length < min && !options.force) {
      throw new ConflictException({
        message: `A turma tem ${paid.length} de ${min} matrículas pagas. Confirme mesmo assim, adie ou cancele.`,
        paid: paid.length,
        minStudents: min,
      });
    }
    if (paid.length === 0) {
      throw new BadRequestException(
        'Sem nenhuma matrícula paga não há turma para confirmar.',
      );
    }

    const converted: Enrollment[] = [];
    const failed: FailedStudent[] = [];
    for (const enrollment of paid) {
      try {
        await this.subscriptions.createFromEnrollment({
          studentId: enrollment.studentId,
          tierId: enrollment.tierId,
          plan: enrollment.mode,
          couponCode: enrollment.couponCode,
          credit: enrollment.feeAmount,
          startDate: turma.startDate!,
        });
        const at = new Date().toISOString();
        const done: Enrollment = {
          ...enrollment,
          status: ENROLLMENT_STATUS.CONVERTED,
          convertedAt: at,
          subscriptionStudentId: enrollment.studentId,
          startDate: turma.startDate,
          updatedAt: at,
        };
        await this.enrollments.save(done);
        converted.push(done);
      } catch (error) {
        failed.push({
          studentId: enrollment.studentId,
          studentName: enrollment.studentName,
          reason: (error as Error).message,
        });
      }
    }

    // O sinal que não caiu até aqui não vira vaga numa turma confirmada.
    for (const pending of all.filter(
      (e) => e.status === ENROLLMENT_STATUS.PENDING,
    )) {
      await this.enrollmentService.cancelPending(pending);
    }

    const confirmed = this.withTurma(turma, {
      status: TURMA_STATUS.CONFIRMED,
      confirmedAt: new Date().toISOString(),
      studentIds: converted.map((e) => e.studentId),
      studentNames: converted.map((e) => e.studentName),
    });
    await this.turmas.save(confirmed);

    for (const enrollment of converted) {
      await this.notifications.turmaConfirmed(enrollment.studentId, confirmed);
    }
    if (failed.length) {
      this.logger.warn(
        `Turma ${turma.id} confirmada com ${failed.length} conversão(ões) pendente(s).`,
      );
    }
    return { turma: confirmed, converted: converted.length, failed };
  }

  /**
   * Novo início, compatível com o calendário. Quem já pagou ganha o direito
   * de desistir com o sinal de volta até a nova data (`withdrawUntilOf`).
   */
  async postpone(
    turmaId: string,
    startDate: string,
    user: AuthenticatedUser,
  ): Promise<Turma> {
    const turma = await this.requireTurma(turmaId);
    if (turma.status !== TURMA_STATUS.FORMING) {
      throw new ConflictException('Só a turma em formação pode ser adiada.');
    }
    if (
      startDate === turma.startDate ||
      !isCompatibleStart(
        {
          tierId: turma.tierId!,
          dayOfWeek: turma.dayOfWeek!,
          weeksOfMonth: turma.weeksOfMonth,
        },
        startDate,
      )
    ) {
      throw new BadRequestException(
        'Escolha uma nova data futura no dia (e, no grupo mensal, numa das semanas) da turma.',
      );
    }

    const from = turma.startDate!;
    const postponed = this.withTurma(turma, {
      startDate,
      startHistory: [
        ...(turma.startHistory ?? []),
        { from, to: startDate, at: new Date().toISOString(), by: user.sub },
      ],
      // O lembrete de 7 dias vale para a data nova.
      reminderSentAt: undefined,
    });
    await this.turmas.save(postponed);

    const paid = (await this.enrollments.findByTurma(turma.id!)).filter(
      (e) => e.status === ENROLLMENT_STATUS.PAID,
    );
    for (const enrollment of paid) {
      await this.notifications.turmaPostponed(
        enrollment.studentId,
        postponed,
        from,
        startDate,
      );
    }
    return postponed;
  }

  /**
   * Cancela e devolve **todos** os sinais pagos. Um estorno que falha não
   * impede os outros nem a turma de fechar para novas matrículas; ele fica
   * no relatório, e cancelar de novo tenta só o que faltou.
   */
  async cancel(
    turmaId: string,
    user: AuthenticatedUser,
  ): Promise<CancelReport> {
    void user;
    const turma = await this.requireTurma(turmaId);
    if (
      turma.status !== TURMA_STATUS.FORMING &&
      turma.status !== TURMA_STATUS.CANCELLED
    ) {
      throw new ConflictException(
        'Turma confirmada não se cancela por aqui: os alunos já têm plano.',
      );
    }

    const cancelled =
      turma.status === TURMA_STATUS.CANCELLED
        ? turma
        : this.withTurma(turma, {
            status: TURMA_STATUS.CANCELLED,
            cancelledAt: new Date().toISOString(),
          });
    if (cancelled !== turma) await this.turmas.save(cancelled);

    let refunded = 0;
    const failed: FailedStudent[] = [];
    for (const enrollment of await this.enrollments.findByTurma(turma.id!)) {
      if (enrollment.status === ENROLLMENT_STATUS.PENDING) {
        await this.enrollmentService.cancelPending(enrollment);
        continue;
      }
      if (enrollment.status !== ENROLLMENT_STATUS.PAID) continue;
      try {
        await this.enrollmentService.refund(
          enrollment,
          'turma-cancelled',
          turma.name,
        );
        refunded++;
      } catch (error) {
        failed.push({
          studentId: enrollment.studentId,
          studentName: enrollment.studentName,
          reason: (error as Error).message,
        });
      }
    }
    return { turma: cancelled, refunded, failed };
  }

  /**
   * Cron diário (§7): a gerente recebe o lembrete das turmas que começam em
   * até 7 dias e ainda não foram decididas. Idempotente por `reminderSentAt`.
   */
  async sendStartReminders(): Promise<string[]> {
    const today = todayInAppTimezone();
    const limit = addDays(today, START_REMINDER_DAYS);
    const sent: string[] = [];
    for (const turma of await this.turmas.findAll()) {
      if (
        !turma.tierId ||
        turma.status !== TURMA_STATUS.FORMING ||
        !turma.startDate ||
        turma.startDate <= today ||
        turma.startDate > limit ||
        turma.reminderSentAt
      ) {
        continue;
      }
      const paid = (await this.enrollments.findByTurma(turma.id!)).filter(
        countsForSeat,
      ).length;
      await this.notifications.turmaStartReminder(turma, paid);
      await this.turmas.save(
        this.withTurma(turma, { reminderSentAt: new Date().toISOString() }),
      );
      sent.push(turma.id!);
    }
    return sent;
  }

  /**
   * As turmas com calendário próprio e a contagem das matrículas, numa ida
   * só: a lista da gerente mostra "pagos/mínimo" em cada linha.
   */
  async overview(): Promise<TurmaOverview[]> {
    const turmas = (await this.turmas.findAll())
      .filter((turma) => !!turma.tierId)
      .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
    return Promise.all(
      turmas.map(async (turma) => {
        const all = await this.enrollments.findByTurma(turma.id!);
        return {
          turma,
          paid: all.filter(countsForSeat).length,
          pending: all.filter((e) => e.status === ENROLLMENT_STATUS.PENDING)
            .length,
        };
      }),
    );
  }

  /** As matrículas de uma turma, para a Gestão › Turmas. */
  async enrollmentsOf(turmaId: string): Promise<Enrollment[]> {
    await this.requireTurma(turmaId);
    return this.enrollments.findByTurma(turmaId);
  }

  private async requireTurma(id: string): Promise<Turma> {
    const turma = await this.turmas.findById(id);
    if (!turma || !turma.tierId) {
      throw new NotFoundException('Turma não encontrada.');
    }
    return turma;
  }

  private withTurma(turma: Turma, changes: Partial<Turma>): Turma {
    return Object.assign(
      Object.create(Turma.prototype) as Turma,
      turma,
      changes,
    );
  }
}
