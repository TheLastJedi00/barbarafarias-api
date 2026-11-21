import { ConflictException } from '@nestjs/common';
import { buildTier } from './subscription.tier.fixtures';
import { hasPaidAccess } from '../users/paid-access';

/**
 * Plano nascido de uma matrícula (spec 036 §5, T19–T20): preço do dia da
 * confirmação, cupom, sinal abatido e tudo contado a partir do início da
 * turma — não da confirmação.
 */
describe('SubscriptionService — plano da turma (spec 036)', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-11-25T15:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  const grupo = {
    id: 'weekly-group' as const,
    name: 'Conversação semanal em grupo',
    packagePrice: 1200,
    monthlyPrice: 230,
  };

  it('pacote: total menos o sinal, a partir do início, pendente e no cartão', async () => {
    const t = buildTier({ tier: grupo });
    const sub = await t.service.createFromEnrollment({
      studentId: 'aluno-1',
      tierId: 'weekly-group',
      plan: 'PACKAGE',
      credit: 150,
      startDate: '2026-12-01',
    });
    expect(sub).toMatchObject({
      status: 'PENDING',
      plan: 'PACKAGE',
      totalAmount: 1050,
      startDate: '2026-12-01',
      priceSnapshot: 1200,
      enrollmentCredit: 150,
      paymentMethod: 'CREDIT_CARD',
    });
    expect(sub.charges[0].dueDate).toBe('2026-12-01');
  });

  it('assinatura: a primeira mensalidade leva o abatimento; fidelidade conta do início', async () => {
    const t = buildTier({ tier: grupo });
    const sub = await t.service.createFromEnrollment({
      studentId: 'aluno-1',
      tierId: 'weekly-group',
      plan: 'SUBSCRIPTION',
      credit: 150,
      startDate: '2026-12-01',
    });
    expect(sub.charges[0].amount).toBe(80);
    expect(sub.charges[1].amount).toBe(230);
    expect(sub.fidelityUntil).toBe('2027-06-01');
  });

  it('cupom da matrícula é aplicado no plano, antes do abatimento', async () => {
    const t = buildTier({
      tier: grupo,
      coupon: {
        tierId: 'weekly-group',
        discountType: 'amount',
        discountValue: 100,
      },
    });
    const sub = await t.service.createFromEnrollment({
      studentId: 'aluno-1',
      tierId: 'weekly-group',
      plan: 'PACKAGE',
      couponCode: 'BEMVINDA',
      credit: 150,
      startDate: '2026-12-01',
    });
    expect(sub.totalAmount).toBe(950);
    expect(sub.couponCode).toBe('BEMVINDA');
  });

  it('o aluno fica sem acesso até o início, mesmo pago', async () => {
    const t = buildTier({ tier: grupo });
    await t.service.createFromEnrollment({
      studentId: 'aluno-1',
      tierId: 'weekly-group',
      plan: 'PACKAGE',
      credit: 150,
      startDate: '2026-12-01',
    });
    const espelho = t.users.updateSubscriptionState.mock.calls.at(-1)![1];
    expect(espelho).toMatchObject({ accessFrom: '2026-12-01' });

    const pago = { ...espelho, isPaying: true };
    expect(hasPaidAccess(pago, new Date('2026-11-30T12:00:00Z'))).toBe(false);
    expect(hasPaidAccess(pago, new Date('2026-12-01T12:00:00Z'))).toBe(true);
  });

  it('liberação manual da gerente vale mesmo antes do início', () => {
    expect(
      hasPaidAccess(
        {
          isPaying: true,
          accessFrom: '2026-12-01',
          manualAccessUntil: '2026-11-30',
        },
        new Date('2026-11-28T12:00:00Z'),
      ),
    ).toBe(true);
  });

  it('quem já tem plano vivo não ganha outro', async () => {
    const t = buildTier({ tier: grupo });
    t.subscriptions.store.set('aluno-1', { status: 'ACTIVE' } as any);
    await expect(
      t.service.createFromEnrollment({
        studentId: 'aluno-1',
        tierId: 'weekly-group',
        plan: 'PACKAGE',
        credit: 150,
        startDate: '2026-12-01',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('pago o plano, quem veio pelo cadastro da loja deixa de ser só da loja', async () => {
    const t = buildTier({ tier: grupo });
    const sub = await t.service.createFromEnrollment({
      studentId: 'aluno-1',
      tierId: 'weekly-group',
      plan: 'PACKAGE',
      credit: 150,
      startDate: '2026-12-01',
    });
    expect(
      t.users.updateSubscriptionState.mock.calls.at(-1)![1],
    ).not.toHaveProperty('leavesStore');

    sub.status = 'ACTIVE';
    await (t.service as any).syncUser(sub);
    expect(t.users.updateSubscriptionState.mock.calls.at(-1)![1]).toMatchObject(
      { leavesStore: true },
    );
  });
});
