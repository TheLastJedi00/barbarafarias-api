import { FlashcardDeckRepository } from './flashcard-deck.repository';

/** Dublê do Firestore só com o que o repositório usa. */
function makeDb(docs: Record<string, Record<string, unknown>>) {
  const writes: { id: string; data: unknown; merge: boolean }[] = [];
  const deleted: string[] = [];
  const listeners: {
    id: string;
    next: (s: { id: string; exists: boolean; data: () => unknown }) => void;
    error: (e: Error) => void;
    stopped?: boolean;
  }[] = [];
  const snap = (id: string) => ({
    id,
    exists: id in docs,
    data: () => docs[id],
  });
  const db = {
    writes,
    deleted,
    listeners,
    snap,
    collection: () => ({
      doc: (id: string) => ({
        id,
        get: () => Promise.resolve(snap(id)),
        set: (data: unknown, opts?: { merge?: boolean }) => {
          writes.push({ id, data, merge: !!opts?.merge });
          return Promise.resolve();
        },
        onSnapshot: (
          next: (s: ReturnType<typeof snap>) => void,
          error: (e: Error) => void,
        ) => {
          listeners.push({ id, next, error });
          return () => (listeners.find((l) => l.id === id)!.stopped = true);
        },
      }),
      where: (field: string, _op: string, value: unknown) => ({
        get: () =>
          Promise.resolve({
            docs: Object.keys(docs)
              .filter((id) => docs[id][field] === value)
              .map(snap),
          }),
      }),
    }),
    getAll: (...refs: { id: string }[]) =>
      Promise.resolve(refs.map((r) => snap(r.id))),
    batch: () => ({
      delete: (ref: { id: string }) => deleted.push(ref.id),
      commit: () => Promise.resolve(),
    }),
  };
  return db;
}

describe('FlashcardDeckRepository', () => {
  const docs = {
    topic_B1_t1: {
      kind: 'topic',
      level: 'B1',
      status: 'ready',
      cards: [{ id: 'c01' }],
    },
    topic_A1_t2: { kind: 'topic', level: 'A1', status: 'ready', cards: [] },
    student_u1: { kind: 'student', studentId: 'u1' },
  };

  it('lista os baralhos de tópico do nível e lê padrões de doc incompleto', async () => {
    const repo = new FlashcardDeckRepository(makeDb(docs) as any);
    const decks = await repo.findTopicDecksByLevel('B1');
    expect(decks.map((d) => d.id)).toEqual(['topic_B1_t1']);

    const aluno = await repo.findById('student_u1');
    expect(aluno).toMatchObject({ status: 'generating', cards: [] });
    expect(await repo.findById('nao-existe')).toBeNull();
  });

  it('lê vários de uma vez e ignora os que não existem', async () => {
    const repo = new FlashcardDeckRepository(makeDb(docs) as any);
    const decks = await repo.findMany(['topic_A1_t2', 'x', 'topic_A1_t2']);
    expect(decks.map((d) => d.id)).toEqual(['topic_A1_t2']);
    expect(await repo.findMany([])).toEqual([]);
  });

  it('marca geração sem apagar cartas e grava cartas prontas limpando o erro', async () => {
    const db = makeDb(docs);
    const repo = new FlashcardDeckRepository(db as any);
    await repo.markGenerating({
      id: 'topic_B1_t1',
      kind: 'topic',
      level: 'B1',
      topicId: 't1',
    });
    await repo.saveCards('topic_B1_t1', [], 'Greetings');

    expect(db.writes[0].merge).toBe(true);
    expect(db.writes[0].data).not.toHaveProperty('cards');
    expect(db.writes[1].data).toMatchObject({
      status: 'ready',
      sourceTitle: 'Greetings',
      error: null,
      progress: { generated: 0, total: 0 },
    });
  });

  it('grava o andamento no início e durante a geração', async () => {
    const db = makeDb(docs);
    const repo = new FlashcardDeckRepository(db as any);
    await repo.markGenerating(
      { id: 'student_u1', kind: 'student', studentId: 'u1' },
      { generated: 0, total: 62 },
    );
    await repo.saveProgress('student_u1', { generated: 10, total: 62 });

    expect(db.writes[0].data).toMatchObject({
      status: 'generating',
      progress: { generated: 0, total: 62 },
    });
    expect(db.writes[1].merge).toBe(true);
    expect(db.writes[1].data).toMatchObject({
      progress: { generated: 10, total: 62 },
    });
  });

  it('ouve um baralho: lê cada snapshot, ausente vira null e devolve o cancelamento', () => {
    const db = makeDb(docs);
    const repo = new FlashcardDeckRepository(db as any);
    const seen: unknown[] = [];
    const onError = jest.fn();

    const stop = repo.watchDeck('topic_B1_t1', (d) => seen.push(d), onError);
    const [listener] = db.listeners;
    listener.next(db.snap('topic_B1_t1'));
    listener.next(db.snap('nao_existe'));
    listener.error(new Error('caiu'));
    stop();

    expect(seen[0]).toMatchObject({ id: 'topic_B1_t1', status: 'ready' });
    expect(seen[1]).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(listener.stopped).toBe(true);
  });

  it('apaga em lote', async () => {
    const db = makeDb(docs);
    await new FlashcardDeckRepository(db as any).deleteMany(['a', 'b']);
    expect(db.deleted).toEqual(['a', 'b']);
  });
});
