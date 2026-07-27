import { LessonService } from './lesson.service';
import { AgendaSlot } from '../agenda/agenda.entity';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LESSON_STATUS, Lesson } from './lesson.entity';
import { addDays, todayInAppTimezone } from '../common/time';
import { LessonAccessService } from './lesson-access.service';

describe('LessonService.ensureLessons', () => {
  let service: LessonService;
  let lessonRepository: {
    createMissing: jest.Mock;
    findByRange: jest.Mock;
    findByDate: jest.Mock;
    findByStudent: jest.Mock;
    findById: jest.Mock;
    save: jest.Mock;
  };
  let agendaService: {
    getGrid: jest.Mock;
    resolveScope: jest.Mock;
    getStudentTurmaIds: jest.Mock;
  };
  let makeupService: { createMakeup: jest.Mock };

  const today = todayInAppTimezone();

  beforeEach(() => {
    lessonRepository = {
      createMissing: jest.fn(async (lessons: any[]) => lessons.length),
      findByRange: jest.fn().mockResolvedValue([]),
      findByDate: jest.fn().mockResolvedValue([]),
      findByStudent: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      save: jest.fn(),
    };
    agendaService = {
      getGrid: jest.fn().mockResolvedValue([]),
      resolveScope: jest.fn((_user, id) => id),
      getStudentTurmaIds: jest.fn().mockResolvedValue([]),
    };
    makeupService = {
      createMakeup: jest.fn().mockResolvedValue({ pushed: false }),
    };
    service = new LessonService(
      lessonRepository as any,
      agendaService as any,
      new LessonAccessService(),
      { findById: jest.fn() } as any,
      { findById: jest.fn() } as any,
      makeupService as any,
    );
  });

  function slotOnDate(date: string, hour = 15) {
    const [year, month, day] = date.split('-').map(Number);
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return new AgendaSlot('t1', dayOfWeek, hour, 'student', {
      teacherName: 'Ana',
      studentId: 's1',
      studentName: 'Léo',
    });
  }

  it('cria uma aula por ocorrência do slot no intervalo', async () => {
    const from = today;
    const to = addDays(today, 14);
    agendaService.getGrid.mockResolvedValueOnce([slotOnDate(from)]);

    const created = await service.ensureLessons(from, to, 't1');

    expect(created).toBe(3); // hoje + 2 semanas seguintes
    const lessons = lessonRepository.createMissing.mock.calls[0][0];
    expect(lessons[0]).toMatchObject({
      teacherId: 't1',
      studentId: 's1',
      hour: 15,
      status: LESSON_STATUS.SCHEDULED,
      origin: 'regular',
    });
  });

  it('usa docId determinístico — reexecutar não duplica', async () => {
    agendaService.getGrid.mockResolvedValue([slotOnDate(today)]);

    await service.ensureLessons(today, today, 't1');
    const firstIds = lessonRepository.createMissing.mock.calls[0][0].map(
      (l: any) => l.id,
    );

    await service.ensureLessons(today, today, 't1');
    const secondIds = lessonRepository.createMissing.mock.calls[1][0].map(
      (l: any) => l.id,
    );

    expect(firstIds).toEqual(secondIds);
    expect(firstIds[0]).toBe(`t1_s1_${today}_15`);
  });

  it('não materializa o passado', async () => {
    agendaService.getGrid.mockResolvedValue([slotOnDate(today)]);

    await service.ensureLessons(addDays(today, -30), addDays(today, -1), 't1');

    expect(lessonRepository.createMissing).not.toHaveBeenCalled();
  });

  it('recorta o início do intervalo em hoje quando pedem datas antigas', async () => {
    agendaService.getGrid.mockResolvedValue([slotOnDate(today)]);

    await service.ensureLessons(addDays(today, -30), today, 't1');

    const lessons = lessonRepository.createMissing.mock.calls[0][0];
    expect(lessons).toHaveLength(1);
    expect(lessons[0].date).toBe(today);
  });

  it('ignora slot sem ocupante ou sem professora (legado)', async () => {
    const orphan = new AgendaSlot('', 1, 9, 'student', {});
    agendaService.getGrid.mockResolvedValue([orphan]);

    await service.ensureLessons(today, addDays(today, 7), 't1');

    expect(lessonRepository.createMissing).toHaveBeenCalledWith([]);
  });

  describe('regras da aula', () => {
    const start = new Date('2026-08-03T18:00:00.000Z');
    const at = (minutes: number) =>
      new Date(start.getTime() + minutes * 60_000);
    const teacher = { sub: 't1', role: 'teacher' } as any;
    const student = { sub: 's1', role: 'student' } as any;

    function scheduled(overrides: any = {}) {
      const lesson = new Lesson({
        id: 'l1',
        teacherId: 't1',
        studentId: 's1',
        date: '2026-08-03',
        hour: 15,
        startAt: start.toISOString(),
        origin: 'regular',
        status: LESSON_STATUS.SCHEDULED,
        ...overrides,
      });
      lessonRepository.findById.mockResolvedValue(lesson);
      return lesson;
    }

    it('marca presença dentro das 72h e conclui a aula', async () => {
      scheduled();
      const lesson = await service.markAttendance(teacher, 'l1', true, at(60));

      expect(lesson.status).toBe(LESSON_STATUS.COMPLETED);
      expect(lesson.attendance).toMatchObject({
        present: true,
        markedBy: 't1',
        source: 'manual',
      });
    });

    it('recusa marcar presença antes da aula começar', async () => {
      scheduled();
      await expect(
        service.markAttendance(teacher, 'l1', true, at(-30)),
      ).rejects.toThrow(BadRequestException);
    });

    it('recusa marcar presença depois das 72h', async () => {
      scheduled();
      await expect(
        service.markAttendance(teacher, 'l1', true, at(73 * 60)),
      ).rejects.toThrow(BadRequestException);
    });

    it('falta marcada manualmente dispara a reposição', async () => {
      scheduled();
      await service.markAttendance(teacher, 'l1', false, at(60));
      expect(makeupService.createMakeup).toHaveBeenCalled();
    });

    it('professora de outra aula não marca presença', async () => {
      scheduled({ teacherId: 'outra' });
      await expect(
        service.markAttendance(teacher, 'l1', true, at(60)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('aluno avisa ausência com 4h de antecedência', async () => {
      scheduled();
      const result = await service.studentCancel(student, 'l1', at(-4 * 60));

      expect(result.lesson.status).toBe(LESSON_STATUS.STUDENT_CANCELLED);
      expect(makeupService.createMakeup).toHaveBeenCalled();
    });

    it('recusa aviso de ausência em cima da hora', async () => {
      scheduled();
      await expect(
        service.studentCancel(student, 'l1', at(-60)),
      ).rejects.toThrow(BadRequestException);
    });

    it('só o próprio aluno avisa a ausência', async () => {
      scheduled();
      await expect(
        service.studentCancel({ sub: 's2', role: 'student' } as any, 'l1', at(-5 * 60)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('avalia apenas aula concluída, uma única vez', async () => {
      scheduled({ status: LESSON_STATUS.COMPLETED });
      const rated = await service.rateLesson(student, 'l1', 5, 'ótima aula');
      expect(rated.rating).toMatchObject({ stars: 5, comment: 'ótima aula' });

      await expect(service.rateLesson(student, 'l1', 4)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('não avalia aula que ainda não aconteceu', async () => {
      scheduled();
      await expect(service.rateLesson(student, 'l1', 5)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  it('materializa aula de turma com o id da turma no docId', async () => {
    const [year, month, day] = today.split('-').map(Number);
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    agendaService.getGrid.mockResolvedValue([
      new AgendaSlot('t1', dayOfWeek, 10, 'turma', {
        turmaId: 'tu1',
        turmaName: 'B1 noite',
      }),
    ]);

    await service.ensureLessons(today, today, 't1');

    const lessons = lessonRepository.createMissing.mock.calls[0][0];
    expect(lessons[0].id).toBe(`t1_tu1_${today}_10`);
    expect(lessons[0].turmaId).toBe('tu1');
  });
});
