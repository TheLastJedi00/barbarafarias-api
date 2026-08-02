import {
  TeacherEarningsService,
  WEEKS_PER_MONTH,
} from './teacher-earnings.service';
import type {
  ManagerEarnings,
  TeacherEarnings,
} from './teacher-earnings.service';
import { User } from '../users/user.entity';
import { ROLES } from '../types/role';

describe('TeacherEarningsService', () => {
  let service: TeacherEarningsService;
  let teacherRepository: { findStudentsByTeacher: jest.Mock };
  let billingService: { resolveRate: jest.Mock };
  let managerFinance: { getMonthlyOverview: jest.Mock };

  beforeEach(() => {
    teacherRepository = { findStudentsByTeacher: jest.fn().mockResolvedValue([]) };
    billingService = { resolveRate: jest.fn().mockResolvedValue(60) };
    managerFinance = {
      getMonthlyOverview: jest.fn().mockResolvedValue({
        month: '2026-08',
        revenue: 4800,
        teacherExpenses: 1800,
        infraExpenses: 300,
        profit: 2700,
        activeStudents: 20,
      }),
    };
    service = new TeacherEarningsService(
      teacherRepository as any,
      billingService as any,
      managerFinance as any,
    );
  });

  const student = (data: Partial<User>) => new User(data as any);

  /** Estreita a união para o arm da professora. */
  const asTeacher = (earnings: unknown) => earnings as TeacherEarnings;
  const asManager = (earnings: unknown) => earnings as ManagerEarnings;

  describe('professora — projeção contratual (spec 011 RF12.1)', () => {
    it('projeta a semana pela carga de cada aluno', async () => {
      teacherRepository.findStudentsByTeacher.mockResolvedValue([
        student({ id: 's1', lessonsPerWeek: 2 }),
        student({ id: 's2', lessonsPerWeek: 1 }),
      ]);

      const earnings = asTeacher(await service.forTeacher('t1', ROLES.TEACHER));

      expect(earnings.kind).toBe('teacher');
      expect(earnings.activeStudents).toBe(2);
      expect(earnings.lessonsPerWeek).toBe(3);
      expect(earnings.weekly).toBe(180); // 3 aulas × R$60
    });

    it('deriva o mês da semana', async () => {
      teacherRepository.findStudentsByTeacher.mockResolvedValue([
        student({ id: 's1', lessonsPerWeek: 2 }),
      ]);

      const earnings = asTeacher(await service.forTeacher('t1'));

      expect(earnings.monthly).toBe(
        Math.round(120 * WEEKS_PER_MONTH * 100) / 100,
      );
    });

    it('assume 1 aula por semana quando a carga não está definida', async () => {
      teacherRepository.findStudentsByTeacher.mockResolvedValue([
        student({ id: 's1' }),
      ]);

      const earnings = asTeacher(await service.forTeacher('t1'));
      expect(earnings.lessonsPerWeek).toBe(1);
    });

    it('ignora aluno pendente de realocação', async () => {
      teacherRepository.findStudentsByTeacher.mockResolvedValue([
        student({ id: 's1', lessonsPerWeek: 2 }),
        student({ id: 's2', lessonsPerWeek: 5, pendingTeacher: true }),
      ]);

      const earnings = asTeacher(await service.forTeacher('t1'));

      expect(earnings.activeStudents).toBe(1);
      expect(earnings.weekly).toBe(120);
    });

    it('usa o valor-hora individual da professora', async () => {
      billingService.resolveRate.mockResolvedValue(85);
      teacherRepository.findStudentsByTeacher.mockResolvedValue([
        student({ id: 's1', lessonsPerWeek: 1 }),
      ]);

      const earnings = asTeacher(await service.forTeacher('t1'));

      expect(earnings.hourlyRate).toBe(85);
      expect(earnings.weekly).toBe(85);
    });

    it('devolve zero quando a professora não tem alunos', async () => {
      const earnings = asTeacher(await service.forTeacher('t1'));

      expect(earnings.activeStudents).toBe(0);
      expect(earnings.weekly).toBe(0);
      expect(earnings.monthly).toBe(0);
    });
  });

  // spec 012 Fix 2 — a gerente não recebe valor-hora; ela fica com o lucro.
  describe('gerente — lucro do negócio', () => {
    it('devolve o lucro do mês, não uma projeção de horas', async () => {
      const earnings = asManager(await service.forTeacher('g1', ROLES.MANAGER));

      expect(earnings.kind).toBe('manager');
      expect(earnings.monthly).toBe(2700); // 4800 − 1800 − 300
      expect(earnings.month).toBe('2026-08');
    });

    it('acompanha o lucro com a conta que o produziu', async () => {
      const earnings = asManager(await service.forTeacher('g1', ROLES.MANAGER));

      expect(earnings.revenue).toBe(4800);
      expect(earnings.teacherExpenses).toBe(1800);
      expect(earnings.infraExpenses).toBe(300);
      expect(earnings.activeStudents).toBe(20);
    });

    it('não consulta valor-hora nem alunos vinculados', async () => {
      await service.forTeacher('g1', ROLES.MANAGER);

      expect(billingService.resolveRate).not.toHaveBeenCalled();
      expect(teacherRepository.findStudentsByTeacher).not.toHaveBeenCalled();
    });

    it('não expõe `weekly` — lucro é apuração mensal', async () => {
      const earnings = await service.forTeacher('g1', ROLES.MANAGER);

      expect('weekly' in earnings).toBe(false);
    });

    it('prejuízo passa direto, sem piso em zero', async () => {
      managerFinance.getMonthlyOverview.mockResolvedValue({
        month: '2026-09',
        revenue: 500,
        teacherExpenses: 1800,
        infraExpenses: 300,
        profit: -1600,
        activeStudents: 2,
      });

      const earnings = asManager(await service.forTeacher('g1', ROLES.MANAGER));

      expect(earnings.monthly).toBe(-1600);
    });
  });
});
