import { PracticeRepository } from './practice.repository';
import { AnswerResult, emptyProgress, MissionDay } from './mission-builder';

/** Firestore em memória só com docs, subcoleções e transação. */
function makeDb(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  const ref = (path: string) => ({
    path,
    get: () =>
      Promise.resolve({ exists: store.has(path), data: () => store.get(path) }),
    collection: (name: string) => ({
      doc: (id: string) => ref(`${path}/${name}/${id}`),
    }),
  });
  return {
    store,
    collection: (name: string) => ({
      doc: (id: string) => ref(`${name}/${id}`),
    }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: (r: { get: () => Promise<unknown> }) => r.get(),
        create: (r: { path: string }, data: unknown) => store.set(r.path, data),
        set: (r: { path: string }, data: unknown, opts?: { merge?: boolean }) =>
          store.set(
            r.path,
            opts?.merge
              ? { ...(store.get(r.path) as object), ...(data as object) }
              : data,
          ),
      }),
  };
}

const mission: MissionDay = {
  day: '2026-11-22',
  cards: [],
  answers: {},
  score: 0,
};

describe('PracticeRepository', () => {
  it('não sobrescreve a missão que outra aba já criou', async () => {
    const outra = { ...mission, score: 3 };
    const db = makeDb({ 'practice/u1/days/2026-11-22': outra });
    const repo = new PracticeRepository(db as any);
    expect(await repo.createDay('u1', mission)).toEqual(outra);
  });

  it('progresso ausente vira o vazio', async () => {
    const repo = new PracticeRepository(makeDb() as any);
    expect(await repo.getProgress('u1')).toEqual(emptyProgress());
  });

  it('missão completa grava a média em users/{uid} sem apagar o resto', async () => {
    const db = makeDb({
      'practice/u1/days/2026-11-22': mission,
      'users/u1': { fullName: 'Ana' },
    });
    const repo = new PracticeRepository(db as any);
    const result: AnswerResult = {
      day: { ...mission, score: 8, completedAt: 'now' },
      progress: { ...emptyProgress(), scoreSum: 8, missionsCompleted: 1 },
      summary: { average: 8, missions: 1 },
      changed: true,
    };
    await repo.answer('u1', '2026-11-22', () => result);

    expect(db.store.get('users/u1')).toEqual({
      fullName: 'Ana',
      practiceSummary: { average: 8, missions: 1 },
    });
    expect(db.store.get('practice/u1')).toMatchObject({ scoreSum: 8 });
  });

  it('resposta repetida não grava nada', async () => {
    const db = makeDb({ 'practice/u1/days/2026-11-22': mission });
    const repo = new PracticeRepository(db as any);
    await repo.answer('u1', '2026-11-22', (day, progress) => ({
      day,
      progress,
      changed: false,
    }));
    expect(db.store.has('practice/u1')).toBe(false);
  });
});
