import {
  buildTier,
  ASSINATURA,
  PACOTE_PIX,
} from './subscription.tier.fixtures';
import { buildTierTerms } from './plan-terms';
import { TIER_PLANS } from './subscription.entity';

/**
 * Contrato em PDF (spec 036 §6): o aceite do plano grava, no mesmo passo, o
 * contrato com o **texto** que valia — não só a versão — e o negócio fechado.
 */
describe('SubscriptionService — contrato do plano (spec 036)', () => {
  it('pacote: grava o texto do tier com o preço congelado e o negócio', async () => {
    const t = buildTier({ tier: { packagePrice: 1800, monthlyPrice: 350 } });
    await t.service.choosePlan('aluno-1', PACOTE_PIX as any);

    const aceite = t.acceptances.create.mock.calls[0][0];
    const contrato = t.contracts.recordSafely.mock.calls[0][0];
    const texto = buildTierTerms(
      { ...(await t.planTiers.getEffective()), packagePrice: 1800 } as any,
      TIER_PLANS.PACKAGE,
    );
    expect(contrato).toMatchObject({
      kind: 'PLAN',
      refId: aceite.id,
      studentId: 'aluno-1',
      studentName: 'Ana Aluna',
      termsVersion: texto.version,
      summary: texto.summary,
      clauses: texto.clauses,
      acceptedAt: aceite.acceptedAt,
    });
    expect(contrato.deal).toEqual(
      expect.arrayContaining([
        { label: 'Forma de pagamento', value: 'PIX' },
        expect.objectContaining({ label: 'Valor' }),
      ]),
    );
  });

  it('assinatura: o contrato diz a mensalidade e a fidelidade', async () => {
    const t = buildTier({ tier: { packagePrice: 1800, monthlyPrice: 350 } });
    await t.service.choosePlan('aluno-1', ASSINATURA as any);

    const contrato = t.contracts.recordSafely.mock.calls[0][0];
    expect(contrato.deal).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Mensalidade' }),
        { label: 'Fidelidade', value: '6 meses' },
      ]),
    );
  });

  it('o preço do tier mudar depois não muda o contrato gravado', async () => {
    const t = buildTier({ tier: { packagePrice: 1800 } });
    await t.service.choosePlan('aluno-1', PACOTE_PIX as any);
    t.planTiers.setTier({ packagePrice: 2400 });

    const contrato = t.contracts.recordSafely.mock.calls[0][0];
    expect(JSON.stringify(contrato)).toContain('1.800,00');
    expect(JSON.stringify(contrato)).not.toContain('2.400,00');
  });
});
