import { PlanTierRepository } from './plan-tier.repository';

/** Dublê do Firestore: `create` recusa doc existente com o código 6. */
function makeDb(initial: Record<string, Record<string, unknown>> = {}) {
  const store = new Map(Object.entries(initial));
  const docRef = (id: string) => ({
    id,
    get: async () => ({ id, exists: store.has(id), data: () => store.get(id) }),
    create: jest.fn(async (data: Record<string, unknown>) => {
      if (store.has(id)) throw Object.assign(new Error('exists'), { code: 6 });
      store.set(id, data);
    }),
    set: jest.fn(
      async (data: Record<string, unknown>) => void store.set(id, data),
    ),
  });
  return {
    store,
    collection: () => ({
      doc: docRef,
      get: async () => ({
        docs: [...store.entries()].map(([id, data]) => ({
          id,
          data: () => data,
        })),
      }),
    }),
  };
}

describe('PlanTierRepository', () => {
  it('semeia os três tiers que faltam, inativos e sem preço', async () => {
    const db = makeDb();
    const tiers = await new PlanTierRepository(db as any).listAll();

    expect(tiers.map((tier) => tier.id)).toEqual([
      'private',
      'weekly-group',
      'monthly-group',
    ]);
    expect(db.store.size).toBe(3);
    expect(db.store.get('private')).not.toHaveProperty('id');
    expect(
      tiers.every((tier) => !tier.active && tier.packagePrice === null),
    ).toBe(true);
  });

  it('não sobrescreve o que a gerente editou', async () => {
    const db = makeDb({
      private: { name: 'Editado', packagePrice: 1800, active: true },
    });
    const tiers = await new PlanTierRepository(db as any).listAll();

    expect(tiers[0]).toMatchObject({
      id: 'private',
      name: 'Editado',
      packagePrice: 1800,
      active: true,
    });
    expect(db.store.size).toBe(3);
  });

  it('ignora documentos com id fora dos três', async () => {
    const db = makeDb({ intruso: { name: 'x' } });
    const tiers = await new PlanTierRepository(db as any).listAll();
    expect(tiers.map((tier) => tier.id)).not.toContain('intruso');
  });
});
