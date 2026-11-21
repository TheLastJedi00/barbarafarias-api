import { BadRequestException, ConflictException } from '@nestjs/common';
import { addMonths } from './subscription.service';
import {
  CHARGE_STATUS,
  PAYMENT_METHODS,
  SUBSCRIPTION_STATUS,
  TIER_PLANS,
} from './subscription.entity';
import {
  ASSINATURA,
  CARTAO,
  PACOTE_CARTAO,
  PACOTE_PIX,
  buildTier,
  orderPaga,
} from './subscription.tier.fixtures';

/**
 * Compra por tier (spec 035 §4 e §5). A suíte das assinaturas antigas segue em
 * `subscription.service.spec.ts`, intocada: o Mensal antigo renova como foi
 * contratado (decisão 9).
 */
describe('Tier — pacote de 6 meses', () => {
  it('grava o tier, congela o preço e monta 6 competências da base', async () => {
    const { service, subscriptions } = buildTier();

    await service.choosePlan('aluno-1', PACOTE_PIX);

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved).toMatchObject({
      plan: TIER_PLANS.PACKAGE,
      tierId: 'private',
      tierName: 'Consultoria Particular Premium',
      priceSnapshot: 1800,
      totalAmount: 1800,
      installments: 6,
      status: SUBSCRIPTION_STATUS.PENDING,
    });
    expect(saved.fidelityUntil).toBeUndefined();
    expect(saved.charges.map((charge) => charge.amount)).toEqual([
      300, 300, 300, 300, 300, 300,
    ]);
    expect(saved.charges.map((charge) => charge.dueDate)).toEqual(
      [0, 1, 2, 3, 4, 5].map((months) => addMonths(saved.startDate, months)),
    );
  });

  it('PIX à vista: um QR pelo valor inteiro do pacote', async () => {
    const { service, pix } = buildTier();

    const response = await service.choosePlan('aluno-1', PACOTE_PIX);

    expect(pix.createPixCharge).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1800 }),
    );
    expect(response.pixCopyPaste).toBe('000201...');
  });

  it('PIX pago quita as 6 competências e dá 6 meses de acesso', async () => {
    const { service, subscriptions, users } = buildTier();
    await service.choosePlan('aluno-1', PACOTE_PIX);

    await service.handleMercadoPagoEvent(orderPaga('pix_1'));

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
    expect(saved.paidInstallments).toBe(6);
    expect(
      saved.charges.every((charge) => charge.status === CHARGE_STATUS.PAID),
    ).toBe(true);
    expect(saved.accessUntil).toBe(addMonths(saved.startDate, 6));
    expect(users.updateSubscriptionState).toHaveBeenLastCalledWith(
      'aluno-1',
      expect.objectContaining({ planTier: 'private', isPaying: true }),
    );
  });

  it('cartão: o formulário abre com o valor inteiro e parcelas livres até 12x', async () => {
    const { service } = buildTier();

    const response = await service.choosePlan('aluno-1', PACOTE_CARTAO);

    expect(response.card).toEqual({
      amount: 1800,
      installments: 12,
      chargeIndex: 1,
      installmentsFree: true,
    });
  });

  it('cartão: cobra a base numa order só, nas parcelas que o comprador escolheu', async () => {
    const { service, card, subscriptions } = buildTier();
    await service.choosePlan('aluno-1', PACOTE_CARTAO);

    await service.payWithCard('aluno-1', { ...CARTAO, installments: 10 });

    expect(card.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1800,
        installments: 10,
        recurring: { cycles: 6 },
      }),
    );
    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.cardInstallments).toBe(10);
    expect(saved.paidInstallments).toBe(6);
  });

  it('cartão sem parcelas informadas vai à vista', async () => {
    const { service, card } = buildTier();
    await service.choosePlan('aluno-1', PACOTE_CARTAO);

    await service.payWithCard('aluno-1', CARTAO);

    expect(card.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ installments: 1 }),
    );
  });

  it('mais de 12x é recusado no servidor, seja o que for que a tela mandou', async () => {
    const { service, card } = buildTier();
    await service.choosePlan('aluno-1', PACOTE_CARTAO);

    await expect(
      service.payWithCard('aluno-1', { ...CARTAO, installments: 13 }),
    ).rejects.toThrow(BadRequestException);
    expect(card.createCheckout).not.toHaveBeenCalled();
  });

  it('o preço congelado não muda com o reajuste da gerente', async () => {
    const { service, card, planTiers } = buildTier();
    await service.choosePlan('aluno-1', PACOTE_CARTAO);
    planTiers.setTier({ packagePrice: 2400 });

    await service.payWithCard('aluno-1', CARTAO);

    expect(card.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1800 }),
    );
  });

  it('pacote vigente barra comprar outro até o período terminar', async () => {
    const { service } = buildTier();
    await service.choosePlan('aluno-1', PACOTE_PIX);
    await service.handleMercadoPagoEvent(orderPaga('pix_1'));

    await expect(service.choosePlan('aluno-1', PACOTE_PIX)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('Tier — assinatura com fidelidade', () => {
  it('mensalidade do tier no cartão, com fidelidade de 6 meses', async () => {
    const { service, subscriptions } = buildTier();

    const response = await service.choosePlan('aluno-1', ASSINATURA);

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved).toMatchObject({
      plan: TIER_PLANS.SUBSCRIPTION,
      priceSnapshot: 320,
      installmentAmount: 320,
      fidelityUntil: addMonths(saved.startDate, 6),
    });
    expect(response.card).toEqual({
      amount: 320,
      installments: 1,
      chargeIndex: 1,
    });
  });

  it('abre uma assinatura recorrente pela mensalidade', async () => {
    const { service, card } = buildTier();
    card.createCheckout.mockResolvedValue({
      id: 'pre_1',
      subscriptionId: 'pre_1',
      provider: 'MERCADOPAGO',
      outcome: 'PENDING',
    });
    await service.choosePlan('aluno-1', ASSINATURA);

    await service.payWithCard('aluno-1', CARTAO);

    expect(card.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 320,
        recurring: { cycles: null },
        installments: 1,
      }),
    );
  });

  it('a assinatura é só no cartão', async () => {
    const { service } = buildTier();
    await expect(
      service.choosePlan('aluno-1', {
        ...ASSINATURA,
        paymentMethod: PAYMENT_METHODS.PIX_RECURRING,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('tier sem mensalidade não vende assinatura', async () => {
    const { service } = buildTier({ tier: { monthlyPrice: null } });
    await expect(service.choosePlan('aluno-1', ASSINATURA)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('cada ciclo pago grava o id do pagamento, para o estorno dos 7 dias', async () => {
    const { service, card, subscriptions } = buildTier();
    card.createCheckout.mockResolvedValue({
      id: 'pre_1',
      subscriptionId: 'pre_1',
      provider: 'MERCADOPAGO',
      outcome: 'PENDING',
    });
    await service.choosePlan('aluno-1', ASSINATURA);
    await service.payWithCard('aluno-1', CARTAO);

    await service.handleMercadoPagoEvent({
      topic: 'subscription_authorized_payment',
      id: 'ap_1',
      cycle: {
        id: 'ap_1',
        preapproval_id: 'pre_1',
        status: 'processed',
        payment: { id: 987, status: 'approved', status_detail: 'accredited' },
      },
    } as any);

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
    expect(saved.charges[0]).toMatchObject({
      status: CHARGE_STATUS.PAID,
      gatewayPaymentId: '987',
    });
    // As renovações projetadas seguem pela mensalidade congelada.
    expect(
      saved.charges.slice(1).every((charge) => charge.amount === 320),
    ).toBe(true);
  });
});

describe('Tier — o que não se vende', () => {
  it('tier inativo é 409', async () => {
    const { service } = buildTier({ tier: { active: false } });
    await expect(service.choosePlan('aluno-1', PACOTE_PIX)).rejects.toThrow(
      ConflictException,
    );
  });

  it('tier sem preço é 409', async () => {
    const { service } = buildTier({ tier: { packagePrice: null } });
    await expect(service.choosePlan('aluno-1', PACOTE_PIX)).rejects.toThrow(
      ConflictException,
    );
  });

  it('pacote ou assinatura sem tier é 400', async () => {
    const { service } = buildTier();
    await expect(
      service.choosePlan('aluno-1', {
        ...PACOTE_PIX,
        tierId: undefined,
      } as any),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('Planos antigos — venda encerrada (spec 035, T27)', () => {
  const ANUAL = {
    plan: 'ANNUAL' as const,
    paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
    acceptance: { termsVersion: '2026-10-1', accepted: true },
  };

  it('com LEGACY_PLANS_CLOSED=true, contratar plano antigo é 410', async () => {
    const { service, config } = buildTier();
    config.get.mockImplementation((key: string) =>
      key === 'LEGACY_PLANS_CLOSED' ? 'true' : undefined,
    );

    await expect(service.choosePlan('aluno-1', ANUAL)).rejects.toThrow(
      GoneException,
    );
  });

  it('sem a variável, segue vendendo: o front antigo não pode quebrar antes do novo entrar', async () => {
    const { service } = buildTier();
    await expect(service.choosePlan('aluno-1', ANUAL)).resolves.toBeDefined();
  });

  it('a venda encerrada não afeta os tiers', async () => {
    const { service, config } = buildTier();
    config.get.mockImplementation((key: string) =>
      key === 'LEGACY_PLANS_CLOSED' ? 'true' : undefined,
    );
    await expect(service.choosePlan('aluno-1', PACOTE_PIX)).resolves.toBeDefined();
  });
});
