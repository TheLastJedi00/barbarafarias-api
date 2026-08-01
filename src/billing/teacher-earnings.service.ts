import { Injectable } from '@nestjs/common';
import { TeacherRepository } from '../teachers/teacher.repository';
import { BillingService } from './billing.service';
import { User } from '../users/user.entity';

/** Semanas por mês usadas na projeção mensal (média de 52 semanas / 12). */
export const WEEKS_PER_MONTH = 4.33;

export interface TeacherEarnings {
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
 * Projeção de faturamento da professora (spec 011 RF12.1).
 *
 * É uma **projeção contratual**, não o fechamento do mês: parte dos alunos
 * ativos vinculados a ela e da carga semanal de cada um, multiplicada pelo
 * valor-hora vigente. O fechamento real, aula a aula, continua sendo o
 * `BillingSummaryService` — que só a gerente enxerga.
 */
@Injectable()
export class TeacherEarningsService {
  constructor(
    private readonly teacherRepository: TeacherRepository,
    private readonly billingService: BillingService,
  ) {}

  async forTeacher(teacherId: string): Promise<TeacherEarnings> {
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
      teacherId,
      hourlyRate,
      activeStudents: active.length,
      lessonsPerWeek,
      weekly,
      monthly: round2(weekly * WEEKS_PER_MONTH),
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
