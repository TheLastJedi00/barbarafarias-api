import { LessonService } from './lesson.service';
import { LessonAccessService } from './lesson-access.service';
import { AgendaSlot } from '../agenda/agenda.entity';
import { Turma } from '../turmas/turma.entity';

/**
 * Aulas da turma em formação (spec 036 §4, T22): saem do calendário da
 * turma — não da grade semanal —, só com a turma confirmada e nunca antes do
 * início. No grupo mensal, a semana da fundadora fica com ela.
 */
function build(turmas: Turma[], slots: AgendaSlot[] = []) {
  const created: any[] = [];
  const lessonRepository = {
    createMissing: jest.fn(async (lessons: any[]) => {
      created.push(...lessons);
      return lessons.length;
    }),
  };
  const agendaService = { getGrid: jest.fn(async () => slots) };
  const service = new LessonService(
    lessonRepository as any,
    agendaService as any,
    new LessonAccessService(),
    { findById: jest.fn() } as any,
    { findById: jest.fn(), findAll: jest.fn(async () => turmas) } as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, created };
}

const semanal = (extra: Partial<Turma> = {}) =>
  new Turma('Grupo semanal · terça 19:00', ['a1'], ['Ana'], 'ts', {
    tierId: 'weekly-group',
    dayOfWeek: 2,
    hour: 19,
    startDate: '2026-12-08',
    status: 'CONFIRMED',
    teacherId: 'prof-1',
    teacherName: 'Ana Souza',
    ...extra,
  });

const mensal = (extra: Partial<Turma> = {}) =>
  new Turma('Grupo mensal · terça 19:00', ['a1'], ['Ana'], 'tm', {
    tierId: 'monthly-group',
    dayOfWeek: 2,
    hour: 19,
    weeksOfMonth: [1, 3],
    founderWeek: 3,
    founderId: 'fundadora',
    founderName: 'Bárbara',
    startDate: '2026-12-01',
    status: 'CONFIRMED',
    teacherId: 'prof-1',
    teacherName: 'Ana Souza',
    ...extra,
  });

describe('LessonService — aulas da turma (spec 036)', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-11-21T15:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  it('semanal confirmada: uma aula por semana a partir do início', async () => {
    const { service, created } = build([semanal()]);
    await service.ensureLessons('2026-11-21', '2026-12-31');
    expect(created.map((l) => l.date)).toEqual([
      '2026-12-08',
      '2026-12-15',
      '2026-12-22',
      '2026-12-29',
    ]);
    expect(created[0]).toMatchObject({
      turmaId: 'ts',
      teacherId: 'prof-1',
      hour: 19,
      origin: 'regular',
    });
  });

  it('mensal: duas por mês, a semana da fundadora com ela', async () => {
    const { service, created } = build([mensal()]);
    await service.ensureLessons('2026-11-21', '2027-01-31');
    expect(created.map((l) => `${l.date}:${l.teacherId}`)).toEqual([
      '2026-12-01:prof-1',
      '2026-12-15:fundadora',
      '2027-01-05:prof-1',
      '2027-01-19:fundadora',
    ]);
  });

  it('em formação, cancelada ou turma antiga: nenhuma aula pelo calendário', async () => {
    const { service, created } = build([
      semanal({ status: 'FORMING' }),
      semanal({ id: 'tc', status: 'CANCELLED' } as any),
    ]);
    await service.ensureLessons('2026-11-21', '2026-12-31');
    expect(created).toEqual([]);
  });

  it('a grade semanal não gera aula para turma com calendário próprio', async () => {
    const slot = new AgendaSlot('prof-1', 2, 19, 'turma', {
      turmaId: 'ts',
      turmaName: 'Grupo semanal · terça 19:00',
    });
    const { service, created } = build(
      [semanal({ status: 'FORMING' })],
      [slot],
    );
    await service.ensureLessons('2026-11-21', '2026-12-31');
    expect(created).toEqual([]);
  });

  it('filtrado por professora: só as turmas dela (e a fundadora vê as dela)', async () => {
    const { service, created } = build([mensal()]);
    await service.ensureLessons('2026-11-21', '2027-01-31', 'fundadora');
    expect(created.map((l) => l.date)).toEqual(['2026-12-15', '2027-01-19']);
  });
});
