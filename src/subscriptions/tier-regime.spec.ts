import {
  LEGACY_PLANS,
  TIER_PLANS,
  fidelityUntilOf,
  paidAccessUntil,
  payerAmountsOf,
  regimeOf,
} from './subscription.entity';

/**
 * O regime decide cronograma, cobrança e acesso (spec 035). Para as
 * assinaturas antigas ele precisa responder **exatamente** o que o
 * `PLAN_CONFIGS` respondia; para os tiers, sai do preço congelado na compra.
 */
describe('regimeOf', () => {
  it('assinatura antiga lê o catálogo de sempre', () => {
    expect(regimeOf({ plan: LEGACY_PLANS.SEMIANNUAL })).toEqual({
      label: 'Semestral',
      recurring: false,
      installments: 6,
      installmentAmount: 200,
      months: 6,
    });
    expect(regimeOf({ plan: LEGACY_PLANS.MONTHLY }).recurring).toBe(true);
  });

  it('pacote: fechado, 6 competências com a sexta parte do preço congelado', () => {
    expect(
      regimeOf({
        plan: TIER_PLANS.PACKAGE,
        tierName: 'Consultoria Particular Premium',
        priceSnapshot: 1800,
      }),
    ).toEqual({
      label: 'Consultoria Particular Premium — pacote de 6 meses',
      recurring: false,
      installments: 6,
      installmentAmount: 300,
      months: 6,
    });
  });

  it('assinatura do tier: recorrente, um ciclo por vez pela mensalidade congelada', () => {
    expect(
      regimeOf({
        plan: TIER_PLANS.SUBSCRIPTION,
        tierName: 'Conversação mensal em grupo',
        priceSnapshot: 150,
      }),
    ).toMatchObject({ recurring: true, installments: 1, installmentAmount: 150 });
  });
});

describe('acesso e valores do tier', () => {
  it('pacote pago vale 6 meses a partir do início', () => {
    expect(
      paidAccessUntil({
        plan: TIER_PLANS.PACKAGE,
        priceSnapshot: 1800,
        startDate: '2026-11-20',
        installments: 6,
        paidInstallments: 6,
      }),
    ).toBe('2027-05-20');
  });

  it('assinatura vale um mês por ciclo pago', () => {
    expect(
      paidAccessUntil({
        plan: TIER_PLANS.SUBSCRIPTION,
        priceSnapshot: 150,
        startDate: '2026-11-20',
        installments: 1,
        paidInstallments: 2,
      }),
    ).toBe('2027-01-20');
  });

  it('a fidelidade termina 6 meses depois do início', () => {
    expect(fidelityUntilOf('2026-11-20')).toBe('2027-05-20');
  });

  it('no tier não há tabela de juros: o pagador vê o preço à vista', () => {
    expect(
      payerAmountsOf({
        plan: TIER_PLANS.PACKAGE,
        totalAmount: 1700,
        installments: 6,
      }),
    ).toEqual({ total: 1700, installment: 1700 });
    expect(
      payerAmountsOf({
        plan: TIER_PLANS.SUBSCRIPTION,
        totalAmount: 150,
        installments: 1,
        installmentAmount: 120,
      }),
    ).toEqual({ total: 120, installment: 120 });
  });
});
