import { chancesFor, isPendingStuck } from './store-supply.rules';
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
