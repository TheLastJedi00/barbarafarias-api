import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlanTierService } from './plan-tier.service';
import {
  DEFAULT_TIERS,
  type PlanTier,
  type PlanTierId,
} from './plan-tier.model';

const GERENTE = { sub: 'gerente-1' } as any;
/** 20/11/2026 15:00 em Brasília. */
const AGORA = new Date('2026-11-20T18:00:00Z');
const MEIA_NOITE = '2026-11-21T03:00:00.000Z';

function fakeRepository(
  overrides: Partial<Record<PlanTierId, Partial<PlanTier>>> = {},
) {
  const store = new Map<PlanTierId, PlanTier>();
  for (const seed of Object.values(DEFAULT_TIERS)) {
    store.set(seed.id, {
      ...seed,
      benefits: [...seed.benefits],
      ...overrides[seed.id],
    });
  }
  const history: Array<{ id: PlanTierId; entry: any }> = [];
  return {
    store,
    history,
    listAll: jest.fn(async () =>
      [...store.values()].map((tier) => ({ ...tier })),
    ),
    get: jest.fn(async (id: PlanTierId) => ({ ...store.get(id)! })),
    save: jest.fn(
      async (tier: PlanTier) => void store.set(tier.id, { ...tier }),
    ),
    addHistory: jest.fn(async (id: PlanTierId, entry: any) => {
      history.push({ id, entry });
    }),
  };
}
function build(overrides?: Parameters<typeof fakeRepository>[0]) {
  const repo = fakeRepository(overrides);
  return { service: new PlanTierService(repo as any), repo };
}

const VENDAVEL = { active: true, packagePrice: 1800, monthlyPrice: 320 };

describe('PlanTierService — vitrine pública', () => {
  it('só mostra tier ativo e com preço', async () => {
    const { service } = build({
      private: VENDAVEL,
      'weekly-group': { active: true, packagePrice: null },
      'monthly-group': { active: false, packagePrice: 900 },
    });

    const tiers = await service.listPublic(AGORA);

    expect(tiers.map((tier) => tier.id)).toEqual(['private']);
    expect(tiers[0]).not.toHaveProperty('pending');
  });

  it('mostra o preço agendado a partir da meia-noite, mesmo sem o cron', async () => {
    const { service } = build({
      private: {
        ...VENDAVEL,
        pending: {
          packagePrice: 2000,
          monthlyPrice: 350,
          effectiveAt: MEIA_NOITE,
          requestedBy: 'gerente-1',
          requestedAt: AGORA.toISOString(),
        },
      },
    });

    expect((await service.listPublic(AGORA))[0].packagePrice).toBe(1800);
    expect(
      (await service.listPublic(new Date(MEIA_NOITE)))[0].packagePrice,
    ).toBe(2000);
  });
});

describe('PlanTierService — gestão', () => {
  it('a gerente vê os três, inclusive inativos, com o agendado', async () => {
    const { service } = build();
    const tiers = await service.listAll(AGORA);
    expect(tiers).toHaveLength(3);
    expect(tiers[0]).toHaveProperty('pending');
  });

  it('texto e ativação mudam na hora', async () => {
    const { service, repo } = build();

    const tier = await service.update(
      'private',
      { name: 'Premium', description: 'd', benefits: ['a'], active: true },
      GERENTE,
      AGORA,
    );

    expect(tier).toMatchObject({
      name: 'Premium',
      description: 'd',
      active: true,
    });
    expect(repo.store.get('private')!.updatedBy).toBe('gerente-1');
    expect(repo.store.get('private')!.pending).toBeNull();
  });

  it('preço novo não muda o vigente: vai para o agendado da próxima meia-noite', async () => {
    const { service, repo } = build({ private: VENDAVEL });

    const tier = await service.update(
      'private',
      { packagePrice: 2000 },
      GERENTE,
      AGORA,
    );

    expect(tier.packagePrice).toBe(1800);
    expect(tier.pending).toEqual({
      packagePrice: 2000,
      monthlyPrice: 320,
      effectiveAt: MEIA_NOITE,
      requestedBy: 'gerente-1',
      requestedAt: AGORA.toISOString(),
    });
    expect(repo.store.get('private')!.packagePrice).toBe(1800);
  });

  it('o primeiro preço também espera a meia-noite', async () => {
    const { service } = build();
    const tier = await service.update(
      'private',
      { packagePrice: 1800, monthlyPrice: 320 },
      GERENTE,
      AGORA,
    );
    expect(tier.packagePrice).toBeNull();
    expect(tier.pending?.packagePrice).toBe(1800);
  });

  it('uma segunda alteração no mesmo dia substitui o agendado e preserva o outro preço', async () => {
    const { service } = build({ private: VENDAVEL });
    await service.update('private', { packagePrice: 2000 }, GERENTE, AGORA);
    const tier = await service.update(
      'private',
      { monthlyPrice: 400 },
      GERENTE,
      AGORA,
    );
    expect(tier.pending).toMatchObject({
      packagePrice: 2000,
      monthlyPrice: 400,
    });
  });

  it('voltar ao preço vigente desfaz o agendado', async () => {
    const { service } = build({ private: VENDAVEL });
    await service.update('private', { packagePrice: 2000 }, GERENTE, AGORA);
    const tier = await service.update(
      'private',
      { packagePrice: 1800 },
      GERENTE,
      AGORA,
    );
    expect(tier.pending).toBeNull();
  });

  it('mensalidade nula agenda o fim da assinatura no tier', async () => {
    const { service } = build({ private: VENDAVEL });
    const tier = await service.update(
      'private',
      { monthlyPrice: null },
      GERENTE,
      AGORA,
    );
    expect(tier.pending).toMatchObject({
      packagePrice: 1800,
      monthlyPrice: null,
    });
  });

  it('id fora dos três é 404', async () => {
    const { service } = build();
    await expect(
      service.update('vip' as any, { active: true }, GERENTE, AGORA),
    ).rejects.toThrow(NotFoundException);
  });

  it('desfaz o agendamento', async () => {
    const { service } = build({ private: VENDAVEL });
    await service.update('private', { packagePrice: 2000 }, GERENTE, AGORA);
    const tier = await service.cancelPending('private', GERENTE, AGORA);
    expect(tier.pending).toBeNull();
    expect(tier.packagePrice).toBe(1800);
  });

  it('desfazer quando o preço já entrou em vigor é 400', async () => {
    const { service } = build({ private: VENDAVEL });
    await service.update('private', { packagePrice: 2000 }, GERENTE, AGORA);
    await expect(
      service.cancelPending('private', GERENTE, new Date(MEIA_NOITE)),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('PlanTierService — cron das 00:00', () => {
  it('aplica o agendado vencido, grava o histórico e limpa o pendente', async () => {
    const { service, repo } = build({ private: VENDAVEL });
    await service.update('private', { packagePrice: 2000 }, GERENTE, AGORA);

    const aplicados = await service.applyDuePrices(new Date(MEIA_NOITE));

    expect(aplicados).toEqual(['private']);
    expect(repo.store.get('private')).toMatchObject({
      packagePrice: 2000,
      monthlyPrice: 320,
      pending: null,
    });
    expect(repo.history).toEqual([
      {
        id: 'private',
        entry: expect.objectContaining({
          packagePrice: 2000,
          monthlyPrice: 320,
          effectiveAt: MEIA_NOITE,
          requestedBy: 'gerente-1',
        }),
      },
    ]);
  });

  it('não aplica o que ainda não venceu', async () => {
    const { service, repo } = build({ private: VENDAVEL });
    await service.update('private', { packagePrice: 2000 }, GERENTE, AGORA);

    expect(await service.applyDuePrices(AGORA)).toEqual([]);
    expect(repo.store.get('private')!.packagePrice).toBe(1800);
  });

  it('rodar duas vezes não aplica nada a mais', async () => {
    const { service, repo } = build({ private: VENDAVEL });
    await service.update('private', { packagePrice: 2000 }, GERENTE, AGORA);
    await service.applyDuePrices(new Date(MEIA_NOITE));

    expect(await service.applyDuePrices(new Date(MEIA_NOITE))).toEqual([]);
    expect(repo.history).toHaveLength(1);
  });
});

describe('PlanTierService — preço para a cobrança', () => {
  it('devolve o tier efetivo', async () => {
    const { service } = build({ private: VENDAVEL });
    const tier = await service.getEffective('private', AGORA);
    expect(tier.packagePrice).toBe(1800);
  });

  it('id inválido é 400', async () => {
    const { service } = build();
    await expect(service.getEffective('vip' as any, AGORA)).rejects.toThrow(
      BadRequestException,
    );
  });
});
