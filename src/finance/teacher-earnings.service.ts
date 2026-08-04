import { Injectable } from '@nestjs/common';
import { TeacherRepository } from '../teachers/teacher.repository';
import { BillingService } from '../billing/billing.service';
import { ManagerFinanceService, currentMonth } from './manager-finance.service';
import { User } from '../users/user.entity';
import { ROLES, Role } from '../types/role';

/** Semanas por mês usadas na projeção mensal (média de 52 semanas / 12). */
export const WEEKS_PER_MONTH = 4.33;

/** Faturamento da professora: projeção contratual de horas (spec 011 RF12.1). */
export interface TeacherEarnings {
  kind: 'teacher';
  teacherId: string;
  hourlyRate: number;
  activeStudents: number;
  lessonsPerWeek: number;
  /** Projeção de faturamento em uma semana típica. */
  weekly: number;
  /** Projeção mensal, derivada da semanal. */
  monthly: number;
  currency: string;
}

/**
 * Faturamento da gerente: o **resultado do negócio** (spec 012, Fix 2).
 *
 * Sem `weekly` de propósito — lucro é apuração mensal, e dividir por 4,33
 * produziria um número que não corresponde a nada.
 */
export interface ManagerEarnings {
  kind: 'manager';
  teacherId: string;
  /** 'YYYY-MM' apurado. */
  month: string;
  revenue: number;
  teacherExpenses: number;
  infraExpenses: number;
  /** Receita − despesas. É o que a gerente ganha. */
  monthly: number;
  /** Assinaturas ativas que sustentam a receita. */
  activeStudents: number;
  currency: string;
}

export type Earnings = TeacherEarnings | ManagerEarnings;

/**
 * "Quanto eu ganho" — a resposta depende do papel de quem pergunta.
 *
 * **Professora:** projeção contratual — alunos ativos × carga semanal ×
 * valor-hora. É projeção, não fechamento; o apurado aula a aula continua no
 * `BillingSummaryService`.
 *
 * **Gerente:** ela não recebe valor-hora — é a mesma regra que já mantinha as
 * horas dela fora da folha (spec 012 RF11). O que ela ganha é o **lucro do
 * negócio**: receita das assinaturas menos o custo com professoras e com
 * infraestrutura. A conta não é reescrita aqui; vem do `ManagerFinanceService`,
 * que já a faz para o painel. Ter duas definições de "quanto a gerente ganha"
 * foi exatamente o bug que este serviço carregava.
 */
@Injectable()
export class TeacherEarningsService {
  constructor(
    private readonly teacherRepository: TeacherRepository,
    private readonly billingService: BillingService,
    private readonly managerFinance: ManagerFinanceService,
  ) {}

  async forTeacher(teacherId: string, role?: Role): Promise<Earnings> {
    if (role === ROLES.MANAGER) {
      return this.forManager(teacherId);
    }

    const [students, hourlyRate] = await Promise.all([
      this.teacherRepository.findStudentsByTeacher(teacherId),
      this.billingService.resolveRate(teacherId),
    ]);

    const active = students.filter(isActiveStudent);
    const lessonsPerWeek = active.reduce(
      (total, student) => total + (student.lessonsPerWeek ?? 1),
      0,
    );
    const weekly = lessonsPerWeek * hourlyRate;

    return {
      kind: 'teacher',
      teacherId,
      hourlyRate,
      activeStudents: active.length,
      lessonsPerWeek,
      weekly,
      monthly: round2(weekly * WEEKS_PER_MONTH),
      currency: 'BRL',
    };
  }

  /** Lucro do mês corrente, com a conta que o produziu. */
  private async forManager(
    managerId: string,
    month: string = currentMonth(),
  ): Promise<ManagerEarnings> {
    const overview = await this.managerFinance.getMonthlyOverview(month);

    return {
      kind: 'manager',
      teacherId: managerId,
      month: overview.month,
      revenue: overview.revenue,
      teacherExpenses: overview.teacherExpenses,
      infraExpenses: overview.infraExpenses,
      monthly: overview.profit,
      activeStudents: overview.activeStudents,
      currency: 'BRL',
    };
  }
}

/**
 * Aluno desvinculado (`pendingTeacher`) não entra na projeção: a professora
 * deixou de ser responsável por ele e não será paga por essas horas.
 */
function isActiveStudent(student: User): boolean {
  return !student.pendingTeacher;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
