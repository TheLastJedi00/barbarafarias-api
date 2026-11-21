import {
  DEFAULT_TIERS,
  PLAN_TIER_IDS,
  cacheSecondsUntilPriceChange,
  effectiveTier,
  isSellable,
  nextPriceEffectiveAt,
  publicTierView,
  type PlanTier,
} from './plan-tier.model';

function tier(overrides: Partial<PlanTier> = {}): PlanTier {
  return {
    ...DEFAULT_TIERS[PLAN_TIER_IDS.PRIVATE],
    active: true,
    packagePrice: 1800,
    monthlyPrice: 320,
    ...overrides,
  };
}

describe('Tiers — seed', () => {
  it('são três, com ids fixos', () => {
    expect(Object.keys(DEFAULT_TIERS).sort()).toEqual(
      ['monthly-group', 'private', 'weekly-group'].sort(),
    );
  });

  it('nascem inativos e sem preço: nada é vendido antes de a gerente definir', () => {
    for (const seed of Object.values(DEFAULT_TIERS)) {
      expect(seed.active).toBe(false);
      expect(seed.packagePrice).toBeNull();
      expect(seed.monthlyPrice).toBeNull();
      expect(isSellable(seed)).toBe(false);
    }
  });

  it('a Premium promete professora dedicada; todos incluem as vídeo aulas', () => {
    expect(DEFAULT_TIERS.private.name).toBe('Consultoria Particular Premium');
    expect(DEFAULT_TIERS.private.benefits.join(' ')).toMatch(
      /professora dedicada/i,
    );
    for (const seed of Object.values(DEFAULT_TIERS)) {
      expect(seed.benefits.join(' ')).toMatch(/vídeo aulas/i);
    }
  });
});

describe('Tiers — vendável', () => {
  it('ativo e com preço do pacote', () => {
    expect(isSellable(tier())).toBe(true);
  });

  it('inativo não vende', () => {
    expect(isSellable(tier({ active: false }))).toBe(false);
  });

  it('sem preço do pacote não vende, mesmo ativo', () => {
    expect(isSellable(tier({ packagePrice: null }))).toBe(false);
  });
});

describe('Tiers — vigência do preço (00:00 de Brasília)', () => {
  it('o preço agendado vale a partir da próxima meia-noite de Brasília', () => {
    // 20/11 15:00 em Brasília = 18:00 UTC
    const agora = new Date('2026-11-20T18:00:00Z');
    expect(nextPriceEffectiveAt(agora).toISOString()).toBe(
      '2026-11-21T03:00:00.000Z',
    );
  });

  it('às 23:59 de Brasília ainda é o dia anterior (02:59 UTC já é o dia seguinte em UTC)', () => {
    const agora = new Date('2026-11-21T02:59:00Z');
    expect(nextPriceEffectiveAt(agora).toISOString()).toBe(
      '2026-11-21T03:00:00.000Z',
    );
  });

  it('pedido feito exatamente à meia-noite vale na meia-noite seguinte', () => {
    const agora = new Date('2026-11-21T03:00:00Z');
    expect(nextPriceEffectiveAt(agora).toISOString()).toBe(
      '2026-11-22T03:00:00.000Z',
    );
  });

  const agendado = tier({
    packagePrice: 1800,
    monthlyPrice: 320,
    pending: {
      packagePrice: 2000,
      monthlyPrice: 350,
      effectiveAt: '2026-11-21T03:00:00.000Z',
      requestedBy: 'gerente-1',
      requestedAt: '2026-11-20T18:00:00.000Z',
    },
  });

  it('antes da virada vale o preço antigo e o agendado continua pendente', () => {
    const efetivo = effectiveTier(agendado, new Date('2026-11-21T02:59:59Z'));
    expect(efetivo.packagePrice).toBe(1800);
    expect(efetivo.monthlyPrice).toBe(320);
    expect(efetivo.pending?.packagePrice).toBe(2000);
  });

  it('depois da virada vale o novo, com ou sem o cron ter rodado', () => {
    const efetivo = effectiveTier(agendado, new Date('2026-11-21T03:00:00Z'));
    expect(efetivo.packagePrice).toBe(2000);
    expect(efetivo.monthlyPrice).toBe(350);
    expect(efetivo.pending).toBeNull();
  });

  it('não altera o documento recebido', () => {
    effectiveTier(agendado, new Date('2026-11-22T00:00:00Z'));
    expect(agendado.packagePrice).toBe(1800);
  });
});

describe('Tiers — cache da vitrine', () => {
  it('vence na meia-noite de Brasília quando ela está a menos de 1 h', () => {
    // 23:30 em Brasília
    const agora = new Date('2026-11-21T02:30:00Z');
    expect(cacheSecondsUntilPriceChange(agora)).toBe(1800);
  });

  it('nunca passa de 1 h, para ativar/desativar aparecer rápido', () => {
    const agora = new Date('2026-11-20T18:00:00Z');
    expect(cacheSecondsUntilPriceChange(agora)).toBe(3600);
  });

  it('nunca é zero (o CDN trata 0 como "não guarde" e a meia-noite viraria rajada)', () => {
    const agora = new Date('2026-11-21T02:59:59.900Z');
    expect(cacheSecondsUntilPriceChange(agora)).toBeGreaterThanOrEqual(1);
  });
});

describe('Tiers — visão pública', () => {
  it('não expõe pendente, autor nem data de alteração', () => {
    const view = publicTierView(
      tier({
        pending: {
          packagePrice: 1,
          monthlyPrice: 1,
          effectiveAt: '2030-01-01T03:00:00.000Z',
          requestedBy: 'x',
          requestedAt: 'y',
        },
        updatedBy: 'gerente-1',
      }),
    );
    expect(view).toEqual({
      id: 'private',
      name: 'Consultoria Particular Premium',
      description: expect.any(String),
      benefits: expect.any(Array),
      packagePrice: 1800,
      monthlyPrice: 320,
      packageMonths: 6,
      fidelityMonths: 6,
    });
  });
});
