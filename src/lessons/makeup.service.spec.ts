import { MakeupService } from './makeup.service';
import { LESSON_STATUS, Lesson } from './lesson.entity';

describe('MakeupService.createMakeup', () => {
  let service: MakeupService;
  let lessonRepository: { findByRange: jest.Mock; save: jest.Mock };
  let userRepository: { findById: jest.Mock };

  // 2026-08-03 é uma segunda-feira
  const missed = new Lesson({
    id: 't1_s1_2026-08-03_15',
    teacherId: 't1',
    teacherName: 'Ana',
    studentId: 's1',
    studentName: 'Léo',
    date: '2026-08-03',
    hour: 15,
    startAt: '2026-08-03T18:00:00.000Z',
    status: LESSON_STATUS.STUDENT_NO_SHOW,
  });

  beforeEach(() => {
    lessonRepository = {
      findByRange: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue(undefined),
    };
    userRepository = {
      // reposição combinada: quarta-feira às 10h
      findById: jest
        .fn()
        .mockResolvedValue({ id: 's1', makeupSlot: { dayOfWeek: 3, hour: 10 } }),
    };
    service = new MakeupService(
      lessonRepository as any,
      userRepository as any,
    );
  });

  it('agenda a reposição na próxima ocorrência do slot combinado', async () => {
    const result = await service.createMakeup(new Lesson({ ...missed }));

    expect(result.pushed).toBe(false);
    expect(result.lesson).toMatchObject({
      date: '2026-08-05', // quarta seguinte
      hour: 10,
      origin: 'makeup',
      status: LESSON_STATUS.SCHEDULED,
      rescheduledFromId: missed.id,
    });
  });

  it('liga as duas aulas nos dois sentidos', async () => {
    const original = new Lesson({ ...missed });
    const result = await service.createMakeup(original);

    expect(original.rescheduledToId).toBe(result.lesson!.id);
    expect(result.lesson!.rescheduledFromId).toBe(original.id);
  });

  it('empurra para a semana seguinte quando o slot está ocupado', async () => {
    lessonRepository.findByRange.mockImplementation(async (from: string) =>
      from === '2026-08-05'
        ? [new Lesson({ hour: 10, status: LESSON_STATUS.SCHEDULED } as any)]
        : [],
    );

    const result = await service.createMakeup(new Lesson({ ...missed }));

    expect(result.pushed).toBe(true);
    expect(result.lesson!.date).toBe('2026-08-12');
  });

  it('não gera reposição para aula de turma', async () => {
    const turmaLesson = new Lesson({
      ...missed,
      studentId: undefined,
      turmaId: 'tu1',
    });

    const result = await service.createMakeup(turmaLesson);

    expect(result.lesson).toBeUndefined();
    expect(result.skipped).toBe('turma');
    expect(lessonRepository.save).not.toHaveBeenCalled();
  });

  it('não reagenda quando o aluno não tem slot de reposição cadastrado', async () => {
    userRepository.findById.mockResolvedValueOnce({ id: 's1' });

    const result = await service.createMakeup(new Lesson({ ...missed }));

    expect(result.skipped).toBe('sem-slot');
    expect(lessonRepository.save).not.toHaveBeenCalled();
  });

  it('não duplica reposição de uma aula já reagendada', async () => {
    const already = new Lesson({ ...missed, rescheduledToId: 'outra' });

    const result = await service.createMakeup(already);

    expect(result.skipped).toBe('ja-reagendada');
    expect(lessonRepository.save).not.toHaveBeenCalled();
  });
});
