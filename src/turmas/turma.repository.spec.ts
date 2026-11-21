import { TurmaRepository } from './turma.repository';
import { Turma, TURMA_STATUS } from './turma.entity';

/** Firestore em memória com o que o repositório usa (`add`, `doc().get/set`). */
function makeDb() {
  const store = new Map<string, Record<string, any>>();
  let seq = 0;
  const ref = (id: string) => ({
    id,
    async get() {
      const data = store.get(id);
      return { exists: data !== undefined, id, data: () => data };
    },
    async set(data: Record<string, any>, options?: { merge?: boolean }) {
      store.set(
        id,
        options?.merge ? { ...(store.get(id) ?? {}), ...data } : data,
      );
    },
    async delete() {
      store.delete(id);
    },
  });
  return {
    store,
    collection: () => ({
      doc: (id: string) => ref(id),
      async add(data: Record<string, any>) {
        const id = `t${++seq}`;
        store.set(id, data);
        return ref(id);
      },
      async get() {
        return {
          docs: [...store.entries()].map(([id, data]) => ({
            id,
            data: () => data,
          })),
        };
      },
    }),
  };
}

const formando = (): Omit<Turma, 'id'> =>
  new Turma('Terça 19h', [], [], undefined, {
    teacherId: 'prof-1',
    teacherName: 'Ana',
    tierId: 'weekly-group',
    dayOfWeek: 2,
    hour: 19,
    startDate: '2026-12-01',
    minStudents: 5,
    maxStudents: 8,
    status: TURMA_STATUS.FORMING,
    startHistory: [],
  });

describe('TurmaRepository (spec 036)', () => {
  it('grava e relê os campos da turma em formação', async () => {
    const db = makeDb();
    const repository = new TurmaRepository(db as any);
    const criada = await repository.create(formando());

    const lida = await repository.findById(criada.id!);
    expect(lida).toMatchObject({
      tierId: 'weekly-group',
      dayOfWeek: 2,
      hour: 19,
      startDate: '2026-12-01',
      minStudents: 5,
      maxStudents: 8,
      status: 'FORMING',
    });
  });

  it('turma antiga continua sem os campos novos', async () => {
    const db = makeDb();
    const repository = new TurmaRepository(db as any);
    const criada = await repository.create(
      new Turma('Antiga', ['a1'], ['Bia']),
    );

    const lida = await repository.findById(criada.id!);
    expect(lida!.tierId).toBeUndefined();
    expect(db.store.get(criada.id!)).not.toHaveProperty('status');
  });

  it('o PUT da professora não apaga o calendário da turma em formação', async () => {
    const db = makeDb();
    const repository = new TurmaRepository(db as any);
    const criada = await repository.create(formando());

    await repository.update(criada.id!, {
      name: 'Terça 19h — renomeada',
      studentIds: [],
      studentNames: [],
      meetUrl: 'https://meet.google.com/abc',
    });

    const lida = await repository.findById(criada.id!);
    expect(lida).toMatchObject({
      name: 'Terça 19h — renomeada',
      startDate: '2026-12-01',
      status: 'FORMING',
      meetUrl: 'https://meet.google.com/abc',
    });
  });

  it('save grava a turma inteira (ciclo da formação)', async () => {
    const db = makeDb();
    const repository = new TurmaRepository(db as any);
    const criada = await repository.create(formando());

    criada.status = TURMA_STATUS.CONFIRMED;
    criada.confirmedAt = '2026-11-25T12:00:00.000Z';
    await repository.save(criada);

    expect(await repository.findById(criada.id!)).toMatchObject({
      status: 'CONFIRMED',
      confirmedAt: '2026-11-25T12:00:00.000Z',
    });
  });
});
