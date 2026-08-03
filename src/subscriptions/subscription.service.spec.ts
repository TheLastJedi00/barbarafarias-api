import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SubscriptionService, addMonths } from './subscription.service';
import {
  CHARGE_STATUS,
  PAYMENT_METHODS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUS,
  Subscription,
} from './subscription.entity';
import { Coupon, applyDiscount } from './coupon.entity';

/** Repositório em memória: a regra sob teste é o cronograma, não o Firestore. */
function fakeSubscriptionRepository() {
  const store = new Map<string, Subscription>();
  return {
    store,
    findByStudent: jest.fn(async (id: string) => store.get(id) ?? null),
    findAll: jest.fn(async () => [...store.values()]),
    findByStatus: jest.fn(async (status: string) =>
      [...store.values()].filter((item) => item.status === status),
    ),
    findByChargeId: jest.fn(
      async (chargeId: string) =>
        [...store.values()].find((item) =>
          item.charges.some(
            (charge) =>
              charge.gatewayChargeId === chargeId ||
              charge.abacatePayId === chargeId,
          ),
        ) ?? null,
    ),
    save: jest.fn(async (subscription: Subscription) => {
      store.set(subscription.studentId, subscription);
      return subscription;
    }),
    delete: jest.fn(async (id: string) => void store.delete(id)),
  };
}

function build(overrides: Record<string, any> = {}) {
  const subscriptions = fakeSubscriptionRepository();
  const coupons = {
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    findByCode: jest.fn().mockResolvedValue(null),
    create: jest.fn(async (coupon: Coupon) => coupon),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const users = {
    findById: jest.fn().mockResolvedValue({
      id: 'aluno-1',
      fullName: 'Ana Aluna',
      email: 'ana@example.com',
      phone: '11999999999',
      // `assertPayableProfile` (spec 013 Task 45.3) barra o checkout sem CPF.
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
  };
  const card = {
    isEnabled: jest.fn().mockReturnValue(true),
    createCheckout: jest.fn().mockResolvedValue({
      id: 'bill_1',
      url: 'https://pay.example/1',
      provider: 'ABACATEPAY',
    }),
    cancelSubscription: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'ABACATEPAY_WEBHOOK_SECRET' ? 'segredo' : undefined,
    ),
  };
  Object.assign(config, overrides.config ?? {});

  const service = new SubscriptionService(
    subscriptions as any,
    coupons as any,
    users as any,
    pix as any,
    card as any,
    config as any,
  );
  return { service, subscriptions, coupons, users, pix, card, config };
}

const PIX = { plan: SUBSCRIPTION_PLANS.MONTHLY, paymentMethod: PAYMENT_METHODS.PIX_RECURRING };

describe('addMonths', () => {
  it('preserva o dia do mês', () => {
    expect(addMonths('2026-08-05', 1)).toBe('2026-09-05');
    expect(addMonths('2026-08-05', 12)).toBe('2027-08-05');
  });

  it('encolhe para o último dia quando o mês seguinte é mais curto', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
});

describe('SubscriptionService — cronograma de parcelas', () => {
  it('mensal nasce recorrente: uma parcela conceitual e renovações projetadas', async () => {
    const { service, subscriptions } = build();

    await service.choosePlan('aluno-1', PIX as any);

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.installments).toBe(1);
    expect(saved.installmentAmount).toBe(240);
    expect(saved.charges).toHaveLength(6);
    expect(saved.charges.every((charge) => charge.amount === 240)).toBe(true);
  });

  it('semestral gera 6 parcelas de R$ 200', async () => {
    const { service, subscriptions } = build();

    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.SEMIANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
    } as any);

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.installments).toBe(6);
    expect(saved.charges).toHaveLength(6);
    expect(saved.totalAmount).toBe(1200);
    expect(saved.charges.map((charge) => charge.amount)).toEqual(
      Array(6).fill(200),
    );
  });

  it('anual gera 12 parcelas de R$ 190', async () => {
    const { service, subscriptions } = build();

    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.ANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
    } as any);

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.charges).toHaveLength(12);
    expect(saved.totalAmount).toBe(2280);
  });

  it('as parcelas vencem mês a mês a partir de hoje', async () => {
    const { service, subscriptions } = build();

    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.SEMIANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
    } as any);

    const { charges, startDate, nextChargeDate } =
      subscriptions.store.get('aluno-1')!;
    expect(charges[0].dueDate).toBe(startDate);
    expect(charges[1].dueDate).toBe(addMonths(startDate, 1));
    expect(charges[5].dueDate).toBe(addMonths(startDate, 5));
    expect(nextChargeDate).toBe(charges[0].dueDate);
  });

  it('o plano nasce PENDING e só vira ACTIVE quando a cobrança é confirmada', async () => {
    const { service, subscriptions } = build();

    await service.choosePlan('aluno-1', PIX as any);
    expect(subscriptions.store.get('aluno-1')!.status).toBe(
      SUBSCRIPTION_STATUS.PENDING,
    );

    await service.handleWebhook(
      { event: 'billing.paid', data: { pixQrCode: { id: 'pix_1' } } },
      'segredo',
    );

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
    expect(saved.paidInstallments).toBe(1);
  });

  it('recusa contratar um segundo plano com assinatura ativa', async () => {
    const { service, subscriptions } = build();
    await service.choosePlan('aluno-1', PIX as any);
    subscriptions.store.get('aluno-1')!.status = SUBSCRIPTION_STATUS.ACTIVE;

    await expect(service.choosePlan('aluno-1', PIX as any)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('SubscriptionService — pagamento', () => {
  it('PIX devolve QR Code e copia-e-cola para o modal', async () => {
    const { service } = build();

    const response = await service.choosePlan('aluno-1', PIX as any);

    expect(response.pixQrCodeUrl).toContain('base64');
    expect(response.pixCopyPaste).toBe('000201...');
    expect(response.checkoutUrl).toBeUndefined();
  });

  it('cartão vai para a porta de cartão e devolve o checkout', async () => {
    const { service, pix, card } = build();

    const response = await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.ANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
    } as any);

    expect(response.checkoutUrl).toBe('https://pay.example/1');
    expect(response.pixCopyPaste).toBeUndefined();
    expect(card.createCheckout).toHaveBeenCalledTimes(1);
    expect(pix.createPixCharge).not.toHaveBeenCalled();
  });

  it('PIX não toca a porta de cartão', async () => {
    const { service, card } = build();

    await service.choosePlan('aluno-1', PIX as any);

    expect(card.createCheckout).not.toHaveBeenCalled();
  });

  it('o plano recebe o cartão mesmo com o PIX fora do ar', async () => {
    const { service, pix } = build();
    pix.isEnabled.mockReturnValue(false);

    const response = await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.ANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
    } as any);

    expect(response.checkoutUrl).toBe('https://pay.example/1');
    expect(response.warning).toBeUndefined();
  });

  it('sem gateway configurado o plano é gravado com aviso, não com erro', async () => {
    const { service, pix, subscriptions } = build();
    pix.isEnabled.mockReturnValue(false);

    const response = await service.choosePlan('aluno-1', PIX as any);

    expect(response.warning).toBeTruthy();
    expect(subscriptions.store.get('aluno-1')).toBeDefined();
  });

  it('trocar o método reemite a parcela em aberto e solta a cobrança antiga', async () => {
    const { service, subscriptions, card } = build();
    await service.choosePlan('aluno-1', PIX as any);

    const response = await service.changePaymentMethod('aluno-1', {
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
    });

    expect(response.checkoutUrl).toBe('https://pay.example/1');
    expect(card.createCheckout).toHaveBeenCalledTimes(1);
    expect(subscriptions.store.get('aluno-1')!.charges[0].gatewayChargeId).toBe(
      'bill_1',
    );
  });

  it('o webhook é idempotente: reprocessar não conta a parcela duas vezes', async () => {
    const { service, subscriptions } = build();
    await service.choosePlan('aluno-1', PIX as any);
    const paid = { event: 'billing.paid', data: { pixQrCode: { id: 'pix_1' } } };

    await service.handleWebhook(paid, 'segredo');
    await service.handleWebhook(paid, 'segredo');

    expect(subscriptions.store.get('aluno-1')!.paidInstallments).toBe(1);
  });

  it('o webhook recusa segredo errado', async () => {
    const { service } = build();
    await expect(service.handleWebhook({}, 'outro')).rejects.toThrow();
  });

  it('pagar uma renovação do mensal projeta a próxima', async () => {
    const { service, subscriptions } = build();
    await service.choosePlan('aluno-1', PIX as any);

    await service.handleWebhook(
      { event: 'billing.paid', data: { pixQrCode: { id: 'pix_1' } } },
      'segredo',
    );

    const saved = subscriptions.store.get('aluno-1')!;
    // 6 pendentes continuam à frente, agora com a paga arquivada atrás.
    expect(saved.charges).toHaveLength(7);
    expect(
      saved.charges.filter((charge) => charge.status === CHARGE_STATUS.PENDING),
    ).toHaveLength(6);
  });
});

describe('SubscriptionService — cupons', () => {
  const cupom = new Coupon({
    id: 'c1',
    code: 'BEMVINDA',
    discountAmount: 50,
    durationMonths: 3,
    active: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    createdBy: 'gerente',
  });

  it('aplica o desconto só nas parcelas cobertas pela duração', async () => {
    const { service, subscriptions, coupons } = build();
    coupons.findByCode.mockResolvedValue(cupom);

    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.SEMIANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      couponCode: 'bemvinda',
    } as any);

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.charges.map((charge) => charge.amount)).toEqual([
      150, 150, 150, 200, 200, 200,
    ]);
    expect(saved.totalAmount).toBe(1050);
    expect(saved.couponCode).toBe('BEMVINDA');
  });

  it('cupom vitalício vale para todas as parcelas', async () => {
    const { service, subscriptions, coupons } = build();
    coupons.findByCode.mockResolvedValue(
      new Coupon({ ...cupom, durationMonths: null }),
    );

    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.SEMIANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      couponCode: 'BEMVINDA',
    } as any);

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.charges.every((charge) => charge.amount === 150)).toBe(true);
  });

  it('a parcela nunca fica negativa', () => {
    expect(applyDiscount(200, 500)).toBe(0);
    expect(applyDiscount(200, 50)).toBe(150);
  });

  it('parcela zerada pelo cupom é confirmada sem ir ao gateway', async () => {
    const { service, subscriptions, pix, coupons } = build();
    coupons.findByCode.mockResolvedValue(
      new Coupon({ ...cupom, discountAmount: 999, durationMonths: null }),
    );

    await service.choosePlan('aluno-1', {
      ...PIX,
      couponCode: 'BEMVINDA',
    } as any);

    expect(pix.createPixCharge).not.toHaveBeenCalled();
    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.charges[0].amount).toBe(0);
    expect(saved.charges[0].status).toBe(CHARGE_STATUS.PAID);
    expect(saved.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
  });

  it('recusa cupom inexistente ou desativado', async () => {
    const { service, coupons } = build();
    coupons.findByCode.mockResolvedValue(new Coupon({ ...cupom, active: false }));

    await expect(
      service.choosePlan('aluno-1', { ...PIX, couponCode: 'X' } as any),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('SubscriptionService — cancelamento e cobranças', () => {
  it('cancelar guarda a data e apaga as parcelas ainda não pagas', async () => {
    const { service, subscriptions } = build();
    await service.choosePlan('aluno-1', PIX as any);
    await service.handleWebhook(
      { event: 'billing.paid', data: { pixQrCode: { id: 'pix_1' } } },
      'segredo',
    );

    const cancelled = await service.cancelSubscription('aluno-1');

    expect(cancelled.status).toBe(SUBSCRIPTION_STATUS.CANCELLED);
    expect(cancelled.cancelledAt).toBeTruthy();
    expect(cancelled.nextChargeDate).toBeUndefined();
    expect(subscriptions.store.get('aluno-1')!.charges).toHaveLength(1);
  });

  it('próximas cobranças trazem só o que ainda não foi pago, em ordem de vencimento', async () => {
    const { service } = build();
    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.SEMIANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
    } as any);

    const upcoming = await service.getUpcomingCharges('aluno-1');

    expect(upcoming).toHaveLength(6);
    expect(upcoming[0].index).toBe(1);
    expect(
      upcoming.every((charge) => charge.status !== CHARGE_STATUS.PAID),
    ).toBe(true);
  });

  it('aluno sem plano não tem cobranças', async () => {
    const { service } = build();
    await expect(service.getUpcomingCharges('ninguem')).resolves.toEqual([]);
  });
});

describe('SubscriptionService — simulação de pagamento', () => {
  it('fica trancada fora do DEV_MODE', async () => {
    const { service } = build();
    await service.choosePlan('aluno-1', PIX as any);

    await expect(service.mockPay('aluno-1')).rejects.toThrow(ForbiddenException);
  });

  it('com DEV_MODE confirma a parcela e ativa o plano', async () => {
    const { service, pix, subscriptions } = build({
      config: {
        get: jest.fn((key: string) =>
          key === 'DEV_MODE' ? 'true' : 'segredo',
        ),
      },
    });
    await service.choosePlan('aluno-1', PIX as any);

    const result = await service.mockPay('aluno-1');

    expect(pix.simulatePayment).toHaveBeenCalledWith('pix_1');
    expect(result.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
    expect(subscriptions.store.get('aluno-1')!.paidInstallments).toBe(1);
  });
});

describe('SubscriptionService — validação de cupom (RF16)', () => {
  it('devolve desconto e duração de um cupom ativo', async () => {
    const { service, coupons } = build();
    coupons.findByCode.mockResolvedValue(
      new Coupon({
        id: 'c1',
        code: 'BEMVINDA',
        discountAmount: 50,
        durationMonths: 3,
        active: true,
        createdAt: '',
        createdBy: '',
      }),
    );

    await expect(service.validateCoupon('bemvinda')).resolves.toEqual({
      code: 'BEMVINDA',
      discountAmount: 50,
      durationMonths: 3,
    });
  });

  it('recusa código inexistente', async () => {
    const { service } = build();
    await expect(service.validateCoupon('NADA')).rejects.toThrow();
  });
});
