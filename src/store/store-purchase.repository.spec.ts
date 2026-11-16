import { StorePurchaseRepository } from './store-purchase.repository';
import { StorePurchase } from './store-purchase.model';

function makeDb() {
  const doc = { set: jest.fn().mockResolvedValue(undefined), get: jest.fn() };
  const query = { get: jest.fn(), limit: jest.fn() };
  query.limit.mockReturnValue(query);
  const collection = {
    doc: jest.fn().mockReturnValue(doc),
    where: jest.fn().mockReturnValue(query),
  };
  return {
    db: { collection: jest.fn().mockReturnValue(collection) },
    collection,
    doc,
    query,
  };
}

const purchase: StorePurchase = {
  id: 'c1',
  userId: 'u1',
  productId: 'p1',
  kind: 'module',
  level: 'A1',
  moduleId: 'm1',
  titleSnapshot: 'Módulo 1',
  priceSnapshot: 97,
  installments: 1,
  method: 'PIX',
  status: 'PENDING',
  gateway: {},
  termsVersion: 'v1',
  createdAt: '2026-11-16T00:00:00.000Z',
  updatedAt: '2026-11-16T00:00:00.000Z',
};

describe('StorePurchaseRepository (spec 032)', () => {
  it('grava sem o id e sem undefined', async () => {
    const { db, doc } = makeDb();
    await new StorePurchaseRepository(db as any).save({
      ...purchase,
      paidAt: undefined,
    });
    expect(db.collection).toHaveBeenCalledWith('storePurchases');
    const data = doc.set.mock.calls[0][0];
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('paidAt');
  });

  it('consultas por um campo só', async () => {
    const { db, collection, query } = makeDb();
    query.get.mockResolvedValue({
      docs: [{ id: 'c1', data: () => purchase }],
    });
    const repo = new StorePurchaseRepository(db as any);

    expect(await repo.findByUser('u1')).toHaveLength(1);
    expect(collection.where).toHaveBeenLastCalledWith('userId', '==', 'u1');

    await repo.findByModule('m1');
    expect(collection.where).toHaveBeenLastCalledWith('moduleId', '==', 'm1');

    expect((await repo.findByOrderId('o1'))?.id).toBe('c1');
    expect(collection.where).toHaveBeenLastCalledWith(
      'gateway.orderId',
      '==',
      'o1',
    );
  });

  it('lê doc incompleto com defaults seguros', async () => {
    const { db, doc } = makeDb();
    doc.get.mockResolvedValue({
      exists: true,
      id: 'c1',
      data: () => ({ userId: 'u1', productId: 'p1', status: 'PAID' }),
    });
    const found = await new StorePurchaseRepository(db as any).findById('c1');
    expect(found).toMatchObject({ id: 'c1', gateway: {}, installments: 1 });
  });
});
