import { Injectable, NotFoundException } from '@nestjs/common';
import { LessonRepository } from '../lessons/lesson.repository';
import { TeacherRepository } from '../teachers/teacher.repository';
import { BillingService, isPayable, payableReason } from './billing.service';
import { BillingLine, TeacherClosing } from './billing.entity';
import { PayoutProvider, PayoutResult } from './payout.provider';
import { ROLES, resolveRole } from '../types/role';
import { Lesson } from '../lessons/lesson.entity';

/** 'YYYY-MM' → primeiro e último dia do mês. */
function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

@Injectable()
export class BillingSummaryService {
  constructor(
    private readonly lessonRepository: LessonRepository,
    private readonly teacherRepository: TeacherRepository,
    private readonly billingService: BillingService,
    private readonly payoutProvider: PayoutProvider,
  ) {}

  /**
   * Fechamento do mês por professora. A gerente aparece marcada e com total
   * apenas informativo — ela não entra na folha como despesa (P8).
   */
  async summary(month: string): Promise<TeacherClosing[]> {
    const { from, to } = monthRange(month);
    const [lessons, staff] = await Promise.all([
      this.lessonRepository.findByRange(from, to),
      this.teacherRepository.findAllStaff(),
    ]);

    return Promise.all(
      staff.map(async (teacher) => {
        const mine = lessons.filter(
          (lesson) => lesson.teacherId === teacher.id,
        );
        const payable = mine.filter((lesson) => isPayable(lesson.status));
        const rate = await this.billingService.resolveRate(teacher.id!);

        return {
          teacherId: teacher.id!,
          teacherName: teacher.fullName,
          isManager: resolveRole(teacher) === ROLES.MANAGER,
          pixKey: teacher.pixKey,
          hourlyRate: rate,
          payableLessons: payable.length,
          unpayableLessons: mine.length - payable.length,
          total: payable.reduce(
            (sum, lesson) => sum + (lesson.rateApplied ?? rate),
            0,
          ),
        };
      }),
    );
  }

  /** Detalhe aula a aula que compõe o total da professora no mês. */
  async detail(teacherId: string, month: string): Promise<BillingLine[]> {
    const { from, to } = monthRange(month);
    const lessons = await this.lessonRepository.findByRange(
      from,
      to,
      teacherId,
    );
    const rate = await this.billingService.resolveRate(teacherId);

    return lessons
      .sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour)
      .map((lesson) => this.toLine(lesson, rate));
  }

  /** Dispara (ou instrui) o pagamento do mês — hoje via PIX manual. */
  async pay(teacherId: string, month: string): Promise<PayoutResult> {
    const closing = (await this.summary(month)).find(
      (item) => item.teacherId === teacherId,
    );
    if (!closing) {
      throw new NotFoundException('Professora não encontrada no fechamento');
    }
    return this.payoutProvider.createPixPayout({
      teacherId: closing.teacherId,
      teacherName: closing.teacherName,
      pixKey: closing.pixKey,
      amount: closing.total,
      reference: month,
    });
  }

  private toLine(lesson: Lesson, fallbackRate: number): BillingLine {
    const payable = isPayable(lesson.status);
    return {
      lessonId: lesson.id,
      date: lesson.date,
      hour: lesson.hour,
      studentName: lesson.studentName,
      turmaName: lesson.turmaName,
      status: lesson.status,
      origin: lesson.origin,
      rate: payable ? (lesson.rateApplied ?? fallbackRate) : 0,
      reason: payableReason(lesson.status),
    };
  }
}
