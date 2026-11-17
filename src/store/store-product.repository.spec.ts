import { StoreProductRepository } from './store-product.repository';
import { StoreProduct } from './store-product.model';

function makeDb() {
  const doc = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const query = { get: jest.fn() };
  const collection = {
    doc: jest.fn().mockReturnValue(doc),
    where: jest.fn().mockReturnValue(query),
    get: jest.fn(),
  };
  const batch = {
    update: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };
  return {
    db: {
      collection: jest.fn().mockReturnValue(collection),
      batch: jest.fn().mockReturnValue(batch),
    },
    collection,
    doc,
    query,
    batch,
  };
}

const product: StoreProduct = {
  id: 'p1',
  kind: 'module',
  title: 'Módulo 1',
  description: '',
  price: 97,
  maxInstallments: 12,
  published: false,
  order: 0,
  level: 'A1',
  moduleId: 'm1',
  files: [],
  createdAt: '2026-11-16T00:00:00.000Z',
  updatedAt: '2026-11-16T00:00:00.000Z',
};

describe('StoreProductRepository (spec 032)', () => {
  it('grava sem o id no corpo e sem campos undefined', async () => {
    const { db, collection, doc } = makeDb();
    await new StoreProductRepository(db as any).save({
      ...product,
      cover: undefined,
    });

    expect(db.collection).toHaveBeenCalledWith('storeProducts');
    expect(collection.doc).toHaveBeenCalledWith('p1');
    const data = doc.set.mock.calls[0][0];
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('cover');
    expect(data.moduleId).toBe('m1');
  });

  it('lê doc incompleto com defaults seguros', async () => {
    const { db, doc } = makeDb();
    doc.get.mockResolvedValue({
      exists: true,
      id: 'p1',
      data: () => ({ kind: 'download', title: 'Apostila', price: 30 }),
    });
    const found = await new StoreProductRepository(db as any).findById('p1');
    expect(found).toMatchObject({
      id: 'p1',
      kind: 'download',
      published: false,
      files: [],
      maxInstallments: 12,
      description: '',
    });
  });

  it('null quando o doc não existe', async () => {
    const { db, doc } = makeDb();
    doc.get.mockResolvedValue({ exists: false });
    expect(
      await new StoreProductRepository(db as any).findById('x'),
    ).toBeNull();
  });

  it('vitrine consulta só por published (um campo, sem índice composto)', async () => {
    const { db, collection, query } = makeDb();
    query.get.mockResolvedValue({
      docs: [{ id: 'p1', data: () => ({ ...product, published: true }) }],
    });
    const list = await new StoreProductRepository(db as any).findPublished();
    expect(collection.where).toHaveBeenCalledWith('published', '==', true);
    expect(list).toHaveLength(1);
  });

  it('grava a ordem em lote', async () => {
    const { db, batch } = makeDb();
    await new StoreProductRepository(db as any).saveOrders(
      [
        { id: 'a', order: 0 },
        { id: 'b', order: 1 },
      ],
      'now',
    );
    expect(batch.update).toHaveBeenCalledTimes(2);
    expect(batch.commit).toHaveBeenCalled();
  });
});
