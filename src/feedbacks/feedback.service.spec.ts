import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { StudentFeedback } from './feedback.entity';
import { ROLES } from '../types/role';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let feedbackRepository: { create: jest.Mock; findByStudent: jest.Mock };
  let userRepository: { findById: jest.Mock };

  const manager = { sub: 'm1', role: ROLES.MANAGER } as any;
  const teacher = { sub: 't1', role: ROLES.TEACHER } as any;
  const otherTeacher = { sub: 't2', role: ROLES.TEACHER } as any;
  const student = { sub: 's1', role: ROLES.STUDENT } as any;

  beforeEach(() => {
    feedbackRepository = {
      create: jest.fn(async (feedback: StudentFeedback) => feedback),
      findByStudent: jest.fn().mockResolvedValue([]),
    };
    userRepository = {
      findById: jest.fn(async (id: string) =>
        id === 's1'
          ? { id: 's1', fullName: 'Léo', teacherId: 't1' }
          : { id, fullName: 'Ana' },
      ),
    };
    service = new FeedbackService(
      feedbackRepository as any,
      userRepository as any,
    );
  });

  it('a professora responsável registra o feedback', async () => {
    const feedback = await service.create(
      teacher,
      's1',
      { text: 'evoluiu no listening', perceivedLevel: 'A2' } as any,
      new Date('2026-08-03T12:00:00Z'),
    );

    expect(feedback).toMatchObject({
      studentId: 's1',
      studentName: 'Léo',
      teacherId: 't1',
      teacherName: 'Ana',
      perceivedLevel: 'A2',
      date: '2026-08-03',
    });
  });

  it('a gerente também registra e lê', async () => {
    await expect(
      service.create(manager, 's1', { text: 'ok' } as any),
    ).resolves.toBeDefined();
    await expect(service.findByStudent(manager, 's1')).resolves.toEqual([]);
  });

  it('professora de outro aluno é bloqueada', async () => {
    await expect(service.findByStudent(otherTeacher, 's1')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.create(otherTeacher, 's1', { text: 'x' } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('o aluno não acessa o próprio acompanhamento', async () => {
    await expect(service.findByStudent(student, 's1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('aluno inexistente devolve 404', async () => {
    userRepository.findById.mockResolvedValueOnce(null);
    await expect(service.findByStudent(manager, 'nao-existe')).rejects.toThrow(
      NotFoundException,
    );
  });
});
