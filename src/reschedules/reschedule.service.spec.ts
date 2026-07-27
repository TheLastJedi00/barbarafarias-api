import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RescheduleService } from './reschedule.service';
import { LessonAccessService } from '../lessons/lesson-access.service';
import { LESSON_STATUS, Lesson } from '../lessons/lesson.entity';
import { RESCHEDULE_KIND, RESCHEDULE_STATUS } from './reschedule.entity';

describe('RescheduleService', () => {
  let service: RescheduleService;
  let rescheduleRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findById: jest.Mock;
    findByStatus: jest.Mock;
    findByTeacher: jest.Mock;
    findPendingByLesson: jest.Mock;
  };
  let lessonRepository: {
    findById: jest.Mock;
    findByRange: jest.Mock;
    save: jest.Mock;
  };

  const start = new Date('2026-08-03T18:00:00.000Z'); // segunda, 15h em SP
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
  const teacher = { sub: 't1', role: 'teacher' } as any;
  const manager = { sub: 'm1', role: 'manager' } as any;

  function lesson(overrides: any = {}) {
    const entity = new Lesson({
      id: 't1_s1_2026-08-03_15',
      teacherId: 't1',
      teacherName: 'Ana',
      studentId: 's1',
      studentName: 'Léo',
      date: '2026-08-03',
      hour: 15,
      startAt: start.toISOString(),
      status: LESSON_STATUS.SCHEDULED,
      origin: 'regular',
      ...overrides,
    });
    lessonRepository.findById.mockResolvedValue(entity);
    return entity;
  }

  const validDto = {
    proposedDate: '2026-08-10',
    proposedHour: 15,
    reasonType: 'saude',
  } as any;

  beforeEach(() => {
    rescheduleRepository = {
      create: jest.fn(async (request: any) => ({ ...request, id: 'r1' })),
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByStatus: jest.fn().mockResolvedValue([]),
      findByTeacher: jest.fn().mockResolvedValue([]),
      findPendingByLesson: jest.fn().mockResolvedValue(null),
    };
    lessonRepository = {
      findById: jest.fn(),
      findByRange: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue(undefined),
    };
    service = new RescheduleService(
      rescheduleRepository as any,
      lessonRepository as any,
      new LessonAccessService(),
    );
  });

  describe('solicitação planejada', () => {
    it('aceita com 4h ou mais de antecedência', async () => {
      lesson();
      const request = await service.request(
        teacher,
        'l1',
        validDto,
        at(-5 * 60),
      );

      expect(request.kind).toBe(RESCHEDULE_KIND.PLANNED);
      expect(request.status).toBe(RESCHEDULE_STATUS.PENDING);
      expect(request.reasonType).toBe('saude');
    });

    it('recusa em cima da hora', async () => {
      lesson();
      await expect(
        service.request(teacher, 'l1', validDto, at(-60)),
      ).rejects.toThrow(BadRequestException);
    });

    it('recusa duas solicitações pendentes para a mesma aula', async () => {
      lesson();
      rescheduleRepository.findPendingByLesson.mockResolvedValueOnce({
        id: 'r0',
      });

      await expect(
        service.request(teacher, 'l1', validDto, at(-5 * 60)),
      ).rejects.toThrow(BadRequestException);
    });

    it('recusa horário proposto já ocupado', async () => {
      lesson();
      lessonRepository.findByRange.mockResolvedValueOnce([
        new Lesson({ hour: 15, status: LESSON_STATUS.SCHEDULED } as any),
      ]);

      await expect(
        service.request(teacher, 'l1', validDto, at(-5 * 60)),
      ).rejects.toThrow(BadRequestException);
    });

    it('bloqueia professora que não é dona da aula', async () => {
      lesson({ teacherId: 'outra' });
      await expect(
        service.request(teacher, 'l1', validDto, at(-5 * 60)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('ausência não avisada', () => {
    it('classifica como no_show quando a professora não entrou e a janela fechou', async () => {
      lesson();
      const request = await service.request(teacher, 'l1', validDto, at(60));

      expect(request.kind).toBe(RESCHEDULE_KIND.NO_SHOW);
    });

    it('no_show não exige as 4h de antecedência', async () => {
      lesson();
      await expect(
        service.request(teacher, 'l1', validDto, at(120)),
      ).resolves.toBeDefined();
    });

    it('não é no_show se a professora entrou na sala', async () => {
      lesson({ teacherJoinedAt: at(-5).toISOString() });
      await expect(
        service.request(teacher, 'l1', validDto, at(60)),
      ).rejects.toThrow(BadRequestException); // volta a exigir antecedência
    });

    it('sugere o mesmo horário na semana seguinte', async () => {
      lesson();
      const suggestion = await service.suggestForNoShow(teacher, 'l1', at(60));

      expect(suggestion).toMatchObject({
        proposedDate: '2026-08-10',
        proposedHour: 15,
      });
    });
  });

  describe('decisão da gerente', () => {
    function pending() {
      const request = {
        id: 'r1',
        lessonId: 'l1',
        teacherId: 't1',
        teacherName: 'Ana',
        studentId: 's1',
        studentName: 'Léo',
        proposedDate: '2026-08-10',
        proposedHour: 15,
        status: RESCHEDULE_STATUS.PENDING,
      };
      rescheduleRepository.findById.mockResolvedValue(request);
      return request;
    }

    it('aprova: original vira ausência não paga e nasce a remarcada', async () => {
      const original = lesson();
      pending();

      const { lesson: created } = await service.approve(manager, 'r1', 'ok');

      expect(original.status).toBe(LESSON_STATUS.TEACHER_ABSENCE);
      expect(original.payable).toBe(false);
      expect(created).toMatchObject({
        date: '2026-08-10',
        hour: 15,
        origin: 'rescheduled',
        status: LESSON_STATUS.SCHEDULED,
        rescheduledFromId: original.id,
      });
      expect(original.rescheduledToId).toBe(created.id);
    });

    it('recusa mantém a aula original de pé', async () => {
      const original = lesson();
      pending();

      const request = await service.reject(manager, 'r1', 'remarque com o aluno');

      expect(request.status).toBe(RESCHEDULE_STATUS.REJECTED);
      expect(request.decisionNote).toBe('remarque com o aluno');
      expect(original.status).toBe(LESSON_STATUS.SCHEDULED);
    });

    it('não decide duas vezes a mesma solicitação', async () => {
      lesson();
      rescheduleRepository.findById.mockResolvedValue({
        id: 'r1',
        status: RESCHEDULE_STATUS.APPROVED,
      });

      await expect(service.approve(manager, 'r1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
