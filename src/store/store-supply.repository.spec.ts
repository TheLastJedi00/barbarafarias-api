import { StoreSupplyRepository } from './store-supply.repository';
import type { StoreSupply } from './store-supply.model';

const supply: StoreSupply = {
  id: 'u1_p1',
  userId: 'u1',
  productId: 'p1',
  level: 'A1',
  moduleId: 'm1',
  chances: { purchaseId: 'c1', used: 1, lastStartedAt: undefined },
  lastGeneration: 1,
  current: { generation: 1, finishedAt: '2026-11-17T00:00:00.000Z' },
  createdAt: '2026-11-17T00:00:00.000Z',
  updatedAt: '2026-11-17T00:00:00.000Z',
};

function makeDb() {
  const docs = new Map<string, any>();
  const refs = new Map<string, any>();
  const ref = (collection: string, id: string) => {
    const key = `${collection}/${id}`;
    if (!refs.has(key)) {
      refs.set(key, {
        key,
        id,
        get: jest.fn(async () => ({
          id,
          exists: docs.has(key),
          data: () => docs.get(key),
        })),
        set: jest.fn(async (data: any) => void docs.set(key, data)),
      });
    }
    return refs.get(key);
  };
  const batch = {
    set: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };
  const tx = {
    get: jest.fn(async (r: any) => r.get()),
    set: jest.fn((r: any, data: any) => docs.set(r.key, data)),
  };
  const query = { get: jest.fn() };
  const db = {
    collection: jest.fn((name: string) => ({
      doc: (id: string) => ref(name, id),
      where: jest.fn().mockReturnValue(query),
      get: query.get,
    })),
    batch: () => batch,
    runTransaction: jest.fn(async (fn: any) => fn(tx)),
  };
  return { db, docs, batch, tx, query };
}

describe('StoreSupplyRepository (spec 033)', () => {
  it('lê o cabeçalho com o id e sem campos ausentes', async () => {
    const { db, docs } = makeDb();
    const { id, ...data } = supply;
    docs.set('storeSupplies/u1_p1', JSON.parse(JSON.stringify(data)));

    const found = await new StoreSupplyRepository(db as any).findById('u1_p1');

    expect(found).toEqual({
      ...supply,
      chances: { purchaseId: 'c1', used: 1 },
    });
    expect(found).not.toHaveProperty('pending');
    expect(id).toBe('u1_p1');
  });

  it('transact grava o que a função devolve, dentro da transação', async () => {
    const { db, docs, tx } = makeDb();
    const repo = new StoreSupplyRepository(db as any);

    const result = await repo.transact('u1_p1', (current) => {
      expect(current).toBeNull();
      return { write: supply, result: 'ok' };
    });

    expect(result).toBe('ok');
    expect(tx.set).toHaveBeenCalledTimes(1);
    expect(docs.get('storeSupplies/u1_p1')).not.toHaveProperty('id');
  });

  it('transact sem `write` não grava', async () => {
    const { db, tx } = makeDb();
    await new StoreSupplyRepository(db as any).transact('u1_p1', () => ({
      result: 1,
    }));
    expect(tx.set).not.toHaveBeenCalled();
  });

  it('conteúdo de uma etapa vai por merge no doc da geração', async () => {
    const { db } = makeDb();
    const repo = new StoreSupplyRepository(db as any);
    await repo.saveStepContent('u1_p1', 2, 'intro', 'Olá');

    const ref = db.collection('storeSupplyModules').doc('u1_p1_2');
    expect(ref.set).toHaveBeenCalledWith(
      { supplyId: 'u1_p1', generation: 2, steps: { intro: 'Olá' } },
      { merge: true },
    );
  });

  it('finish troca o vigente numa tacada e apaga a geração anterior', async () => {
    const { db, batch } = makeDb();
    const repo = new StoreSupplyRepository(db as any);
    const module = { title: 'M', text: 'intro', topics: [] };

    await repo.finish({ ...supply, lastGeneration: 2 }, 2, module, 1);

    expect(batch.set).toHaveBeenCalledTimes(2);
    expect(batch.delete).toHaveBeenCalledTimes(1);
    expect(batch.delete.mock.calls[0][0].id).toBe('u1_p1_1');
    expect(batch.commit).toHaveBeenCalled();
  });

  it('delete apaga o cabeçalho e todas as gerações', async () => {
    const { db, batch, query } = makeDb();
    query.get.mockResolvedValue({
      docs: [{ ref: { id: 'u1_p1_1' } }, { ref: { id: 'u1_p1_2' } }],
    });

    await new StoreSupplyRepository(db as any).delete('u1_p1');

    expect(batch.delete).toHaveBeenCalledTimes(3);
    expect(batch.commit).toHaveBeenCalled();
  });
});
