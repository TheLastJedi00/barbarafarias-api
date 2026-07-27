import { LessonService } from './lesson.service';
import { AgendaSlot } from '../agenda/agenda.entity';
import { LESSON_STATUS } from './lesson.entity';
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
    service = new LessonService(
      lessonRepository as any,
      agendaService as any,
      new LessonAccessService(),
      { findById: jest.fn() } as any,
      { findById: jest.fn() } as any,
      { createMakeup: jest.fn().mockResolvedValue({ pushed: false }) } as any,
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
