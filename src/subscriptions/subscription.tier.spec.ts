import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { SubscriptionService, addMonths } from './subscription.service';
import {
  CHARGE_STATUS,
  PAYMENT_METHODS,
  SUBSCRIPTION_STATUS,
  TIER_PLANS,
  Subscription,
} from './subscription.entity';
import { Coupon } from './coupon.entity';
import type { PlanTier } from '../plan-tiers/plan-tier.model';
import { DEFAULT_TIERS } from '../plan-tiers/plan-tier.model';

/**
 * Compra por tier (spec 035 §4 e §5). A suíte das assinaturas antigas segue em
 * `subscription.service.spec.ts`, intocada: o Mensal antigo renova como foi
 * contratado (decisão 9).
 */
function fakeSubscriptionRepository() {
  const store = new Map<string, Subscription>();
  return {
    store,
    findByStudent: jest.fn(async (id: string) => store.get(id) ?? null),
    findAll: jest.fn(async () => [...store.values()]),
    findByChargeId: jest.fn(
      async (chargeId: string) =>
        [...store.values()].find((item) =>
          item.charges.some((charge) => charge.gatewayChargeId === chargeId),
        ) ?? null,
    ),
    findByGatewaySubscriptionId: jest.fn(
      async (id: string) =>
        [...store.values()].find((item) => item.gatewaySubscriptionId === id) ??
        null,
    ),
    save: jest.fn(async (subscription: Subscription) => {
      store.set(subscription.studentId, subscription);
      return subscription;
    }),
  };
}

export function tierDe(overrides: Partial<PlanTier> = {}): PlanTier {
  return {
    ...DEFAULT_TIERS.private,
    benefits: [...DEFAULT_TIERS.private.benefits],
    active: true,
    packagePrice: 1800,
    monthlyPrice: 320,
    ...overrides,
  };
}

export function buildTier(
  options: { tier?: Partial<PlanTier>; coupon?: Partial<Coupon> } = {},
) {
  const subscriptions = fakeSubscriptionRepository();
  const coupon = options.coupon
    ? new Coupon({
        id: 'c1',
        code: 'BEMVINDA',
        discountType: 'amount',
        discountValue: 100,
        durationMonths: null,
        active: true,
        tierId: 'private',
        usedCount: 0,
        createdAt: '',
        createdBy: '',
        ...options.coupon,
      } as any)
    : null;
  const coupons = {
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    findByCode: jest.fn().mockResolvedValue(coupon),
    create: jest.fn(async (created: Coupon) => created),
    update: jest.fn().mockResolvedValue(undefined),
    incrementUsage: jest.fn().mockResolvedValue(undefined),
  };
  const users = {
    findById: jest.fn().mockResolvedValue({
      id: 'aluno-1',
      fullName: 'Ana Aluna',
      email: 'ana@example.com',
      phone: '11999999999',
      cpf: '39053344705',
    }),
    updateSubscriptionState: jest.fn().mockResolvedValue(undefined),
  };
  const pix = {
    isEnabled: jest.fn().mockReturnValue(true),
    createPixCharge: jest.fn().mockResolvedValue({
      id: 'pix_1',
      brCode: '000201...',
      brCodeBase64: 'data:image/png;base64,AAA',
    }),
    simulatePayment: jest.fn().mockResolvedValue(true),
    refundOrder: jest.fn().mockResolvedValue({ status: 'refunded' }),
  };
  const card = {
    isEnabled: jest.fn().mockReturnValue(true),
    createCheckout: jest.fn().mockResolvedValue({
      id: 'ORD01ABC',
      provider: 'MERCADOPAGO',
      outcome: 'PAID',
    }),
    cancelSubscription: jest.fn().mockResolvedValue(undefined),
    updateSubscriptionAmount: jest.fn().mockResolvedValue(undefined),
    fetchChargeOutcome: jest.fn().mockResolvedValue({
      id: 'ORD01ABC',
      provider: 'MERCADOPAGO',
      outcome: 'PAID',
    }),
    refundOrder: jest.fn().mockResolvedValue({ status: 'refunded' }),
    refundPayment: jest.fn().mockResolvedValue(undefined),
  };
  const acceptances = {
    create: jest.fn(async (acceptance: any) => acceptance),
    findAll: jest.fn().mockResolvedValue([]),
  };
  const config = { get: jest.fn(() => undefined) };
  let tier = tierDe(options.tier);
  const planTiers = {
    getEffective: jest.fn(async () => ({ ...tier })),
    setTier: (next: Partial<PlanTier>) => {
      tier = { ...tier, ...next };
    },
  };

  const service = new SubscriptionService(
    subscriptions as any,
    coupons as any,
    users as any,
    acceptances as any,
    pix as any,
    card as any,
    config as any,
    planTiers as any,
  );
  return {
    service,
    subscriptions,
    coupons,
    users,
    acceptances,
    pix,
    card,
    planTiers,
  };
}

export const ACEITE = { termsVersion: '2026-11-1', accepted: true };

export const PACOTE_PIX = {
  plan: TIER_PLANS.PACKAGE,
  tierId: 'private' as const,
  paymentMethod: PAYMENT_METHODS.PIX_RECURRING,
  acceptance: ACEITE,
};

export const PACOTE_CARTAO = {
  ...PACOTE_PIX,
  paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
};

export const ASSINATURA = {
  plan: TIER_PLANS.SUBSCRIPTION,
  tierId: 'private' as const,
  paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
  acceptance: ACEITE,
};

export const CARTAO = { token: 'tok_123', paymentMethodId: 'master' };

export function orderPaga(id: string) {
  return {
    topic: 'order' as const,
    id,
    order: { id, status: 'processed', status_detail: 'accredited' },
  };
}

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
    expect(saved.charges.slice(1).every((charge) => charge.amount === 320)).toBe(
      true,
    );
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
      service.choosePlan('aluno-1', { ...PACOTE_PIX, tierId: undefined } as any),
    ).rejects.toThrow(BadRequestException);
  });
});
