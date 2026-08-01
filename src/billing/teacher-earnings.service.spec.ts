import {
  TeacherEarningsService,
  WEEKS_PER_MONTH,
} from './teacher-earnings.service';
import { User } from '../users/user.entity';

describe('TeacherEarningsService (spec 011 RF12.1)', () => {
  let service: TeacherEarningsService;
  let teacherRepository: { findStudentsByTeacher: jest.Mock };
  let billingService: { resolveRate: jest.Mock };

  beforeEach(() => {
    teacherRepository = { findStudentsByTeacher: jest.fn().mockResolvedValue([]) };
    billingService = { resolveRate: jest.fn().mockResolvedValue(60) };
    service = new TeacherEarningsService(
      teacherRepository as any,
      billingService as any,
    );
  });

  const student = (data: Partial<User>) => new User(data as any);

  it('projeta a semana pela carga de cada aluno', async () => {
    teacherRepository.findStudentsByTeacher.mockResolvedValue([
      student({ id: 's1', lessonsPerWeek: 2 }),
      student({ id: 's2', lessonsPerWeek: 1 }),
    ]);

    const earnings = await service.forTeacher('t1');

    expect(earnings.activeStudents).toBe(2);
    expect(earnings.lessonsPerWeek).toBe(3);
    expect(earnings.weekly).toBe(180); // 3 aulas × R$60
  });

  it('deriva o mês da semana', async () => {
    teacherRepository.findStudentsByTeacher.mockResolvedValue([
      student({ id: 's1', lessonsPerWeek: 2 }),
    ]);

    const earnings = await service.forTeacher('t1');

    expect(earnings.monthly).toBe(
      Math.round(120 * WEEKS_PER_MONTH * 100) / 100,
    );
  });

  it('assume 1 aula por semana quando a carga não está definida', async () => {
    teacherRepository.findStudentsByTeacher.mockResolvedValue([
      student({ id: 's1' }),
    ]);

    const earnings = await service.forTeacher('t1');
    expect(earnings.lessonsPerWeek).toBe(1);
  });

  it('ignora aluno pendente de realocação', async () => {
    teacherRepository.findStudentsByTeacher.mockResolvedValue([
      student({ id: 's1', lessonsPerWeek: 2 }),
      student({ id: 's2', lessonsPerWeek: 5, pendingTeacher: true }),
    ]);

    const earnings = await service.forTeacher('t1');

    expect(earnings.activeStudents).toBe(1);
    expect(earnings.weekly).toBe(120);
  });

  it('usa o valor-hora individual da professora', async () => {
    billingService.resolveRate.mockResolvedValue(85);
    teacherRepository.findStudentsByTeacher.mockResolvedValue([
      student({ id: 's1', lessonsPerWeek: 1 }),
    ]);

    const earnings = await service.forTeacher('t1');

    expect(earnings.hourlyRate).toBe(85);
    expect(earnings.weekly).toBe(85);
  });

  it('devolve zero quando a professora não tem alunos', async () => {
    const earnings = await service.forTeacher('t1');

    expect(earnings.activeStudents).toBe(0);
    expect(earnings.weekly).toBe(0);
    expect(earnings.monthly).toBe(0);
  });
});
