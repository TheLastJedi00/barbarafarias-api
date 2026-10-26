import { BrandIdentityRepository } from './brand-identity.repository';
import { BrandIdentity, DEFAULT_IDENTITY_ID } from './brand-identity.model';

const seed: BrandIdentity = {
  id: DEFAULT_IDENTITY_ID,
  name: 'Bárbara Farias (padrão)',
  isDefault: true,
  content: 'texto do código',
  createdBy: 'system',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
};

/**
 * Dublê do Firestore com o que o repositório usa: `create` recusa doc
 * existente com o código 6 (ALREADY_EXISTS), como o Admin SDK.
 */
function makeDb(initial: Record<string, Omit<BrandIdentity, 'id'>> = {}) {
  const store = new Map(Object.entries(initial));
  const docRef = (id: string) => ({
    id,
    get: async () => ({
      id,
      exists: store.has(id),
      data: () => store.get(id),
    }),
    create: jest.fn(async (data: Omit<BrandIdentity, 'id'>) => {
      if (store.has(id)) throw Object.assign(new Error('exists'), { code: 6 });
      store.set(id, data);
    }),
  });
  return {
    store,
    collection: () => ({ doc: docRef }),
  };
}

describe('BrandIdentityRepository.ensureDefault', () => {
  it('grava a padrão com id fixo quando ela não existe', async () => {
    const db = makeDb();
    const repository = new BrandIdentityRepository(db as any);

    const result = await repository.ensureDefault(seed);

    expect(result).toEqual(seed);
    expect(db.store.get(DEFAULT_IDENTITY_ID)).not.toHaveProperty('id');
  });

  it('devolve a existente quando outra requisição gravou primeiro', async () => {
    // Duas primeiras leituras ao mesmo tempo: o `create` de uma delas perde,
    // e o id fixo garante que nunca existam duas padrões.
    const { id: _id, ...stored } = { ...seed, content: 'editada' };
    const db = makeDb({ [DEFAULT_IDENTITY_ID]: stored });
    const repository = new BrandIdentityRepository(db as any);

    const result = await repository.ensureDefault(seed);

    expect(result.content).toBe('editada');
    expect(result.id).toBe(DEFAULT_IDENTITY_ID);
  });
});
