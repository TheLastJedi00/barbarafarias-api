import {
  chancesFor,
  isPendingStuck,
  supplyEndState,
} from './store-supply.rules';
import type { StoreSupply, StoreSupplyPending } from './store-supply.model';

const H = 60 * 60 * 1000;
const t0 = new Date('2026-11-17T10:00:00.000Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

function supply(chances: StoreSupply['chances']): Pick<StoreSupply, 'chances'> {
  return { chances };
}

describe('chancesFor (spec 033)', () => {
  it('sem material ainda: a primeira geração sai na hora', () => {
    expect(chancesFor(null, 'c1', t0)).toEqual({
      used: 0,
      max: 3,
      canGenerate: true,
    });
  });

  it('a segunda só 6 h depois do início da primeira', () => {
    const s = supply({
      purchaseId: 'c1',
      used: 1,
      lastStartedAt: t0.toISOString(),
    });

    expect(chancesFor(s, 'c1', at(6 * H - 1))).toEqual({
      used: 1,
      max: 3,
      canGenerate: false,
      nextAvailableAt: at(6 * H).toISOString(),
    });
    expect(chancesFor(s, 'c1', at(6 * H)).canGenerate).toBe(true);
  });

  it('a terceira usada fecha a compra, sem próxima liberação', () => {
    const s = supply({
      purchaseId: 'c1',
      used: 3,
      lastStartedAt: t0.toISOString(),
    });
    expect(chancesFor(s, 'c1', at(100 * H))).toEqual({
      used: 3,
      max: 3,
      canGenerate: false,
    });
  });

  it('renovação (outra compra) devolve as chances, sem esperar as 6 h', () => {
    const s = supply({
      purchaseId: 'c1',
      used: 3,
      lastStartedAt: t0.toISOString(),
    });
    expect(chancesFor(s, 'c2', at(1 * H))).toEqual({
      used: 0,
      max: 3,
      canGenerate: true,
    });
  });
});

describe('isPendingStuck', () => {
  const pending = (
    steps: StoreSupplyPending['steps'],
  ): Pick<StoreSupplyPending, 'steps'> => ({ steps });

  it('travada quando uma etapa falhou e já gastou as 3 tentativas', () => {
    expect(
      isPendingStuck(
        pending({
          intro: { title: 'Intro', status: 'done', attempts: 1 },
          t1: { title: 'T1', status: 'failed', attempts: 3 },
        }),
      ),
    ).toBe(true);
  });

  it('não travada enquanto houver tentativa', () => {
    expect(
      isPendingStuck(
        pending({ t1: { title: 'T1', status: 'failed', attempts: 2 } }),
      ),
    ).toBe(false);
  });
});

describe('supplyEndState (spec 033)', () => {
  const base = {
    id: 'c1',
    userId: 'u1',
    productId: 'p1',
    kind: 'module' as const,
    titleSnapshot: 'M',
    priceSnapshot: 97,
    installments: 1,
    method: 'PIX' as const,
    gateway: {},
    termsVersion: 'v1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
  const now = new Date('2026-11-17T00:00:00.000Z');

  it('compra valendo: ativo, sem data de fim', () => {
    expect(
      supplyEndState(
        [{ ...base, status: 'PAID', accessUntil: '2026-12-01T00:00:00.000Z' }],
        now,
      ),
    ).toEqual({ active: true });
  });

  it('vencida: fim no accessUntil e exclusão liberada 30 dias depois', () => {
    expect(
      supplyEndState(
        [{ ...base, status: 'PAID', accessUntil: '2026-11-01T00:00:00.000Z' }],
        now,
      ),
    ).toEqual({
      active: false,
      reason: 'expired',
      endedAt: '2026-11-01T00:00:00.000Z',
      deletableAt: '2026-12-01T00:00:00.000Z',
      deletable: false,
    });
  });

  it('reembolso conta da data do estorno; a compra mais recente manda', () => {
    const state = supplyEndState(
      [
        { ...base, status: 'PAID', accessUntil: '2026-09-01T00:00:00.000Z' },
        {
          ...base,
          id: 'c2',
          status: 'REFUNDED',
          accessUntil: '2027-01-01T00:00:00.000Z',
          refund: { by: 'buyer', at: '2026-10-01T00:00:00.000Z' },
        },
        { ...base, id: 'c3', status: 'CANCELLED' },
      ],
      now,
    );
    expect(state).toMatchObject({
      reason: 'refunded',
      endedAt: '2026-10-01T00:00:00.000Z',
      deletable: true,
    });
  });

  it('contestação conta da última atualização da compra', () => {
    expect(
      supplyEndState(
        [
          {
            ...base,
            status: 'CHARGED_BACK',
            updatedAt: '2026-11-10T00:00:00.000Z',
          },
        ],
        now,
      ),
    ).toMatchObject({
      reason: 'charged_back',
      endedAt: '2026-11-10T00:00:00.000Z',
    });
  });
});
