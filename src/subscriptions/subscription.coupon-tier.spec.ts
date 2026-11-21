import { BadRequestException } from '@nestjs/common';
import { Coupon, discountFor } from './coupon.entity';
import { PAYMENT_METHODS, TIER_PLANS } from './subscription.entity';
import {
  ASSINATURA,
  CARTAO,
  PACOTE_CARTAO,
  PACOTE_PIX,
  buildTier,
  orderPaga,
} from './subscription.tier.fixtures';

/** Cupom por tier (spec 035 §6). */

describe('discountFor', () => {
  it('em reais, nunca mais que o valor', () => {
    expect(
      discountFor({ discountType: 'amount', discountValue: 100 }, 1800),
    ).toBe(100);
    expect(
      discountFor({ discountType: 'amount', discountValue: 5000 }, 1800),
    ).toBe(1800);
  });

  it('em percentual, arredondado ao centavo', () => {
    expect(
      discountFor({ discountType: 'percent', discountValue: 10 }, 1800),
    ).toBe(180);
    expect(
      discountFor({ discountType: 'percent', discountValue: 15 }, 333.33),
    ).toBe(50);
  });

  it('cupom antigo, sem tipo, é em reais', () => {
    expect(discountFor({ discountValue: 50 } as any, 240)).toBe(50);
  });
});

describe('Cupom por tier — pacote', () => {
  it('desconta do valor inteiro, uma vez, e reparte o resto nas 6 competências', async () => {
    const { service, subscriptions } = buildTier({
      coupon: { discountValue: 100 },
    });

    await service.choosePlan('aluno-1', {
      ...PACOTE_PIX,
      couponCode: 'bemvinda',
    });

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.totalAmount).toBe(1700);
    expect(saved.couponCode).toBe('BEMVINDA');
    expect(
      saved.charges.reduce((sum, charge) => sum + charge.amount, 0),
    ).toBeCloseTo(1700, 2);
    expect(saved.charges.map((charge) => charge.amount)).toEqual([
      283.33, 283.33, 283.33, 283.33, 283.33, 283.35,
    ]);
  });

  it('percentual sobre o preço do pacote', async () => {
    const { service, subscriptions, pix } = buildTier({
      coupon: { discountType: 'percent', discountValue: 10 },
    });

    await service.choosePlan('aluno-1', {
      ...PACOTE_PIX,
      couponCode: 'BEMVINDA',
    });

    expect(subscriptions.store.get('aluno-1')!.totalAmount).toBe(1620);
    expect(pix.createPixCharge).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1620 }),
    );
  });

  it('cupom de outro tier é recusado', async () => {
    const { service } = buildTier({ coupon: { tierId: 'weekly-group' } });
    await expect(
      service.choosePlan('aluno-1', { ...PACOTE_PIX, couponCode: 'BEMVINDA' }),
    ).rejects.toThrow(/não vale para este plano/);
  });

  it('cupom antigo (sem tier) não vale para tier', async () => {
    const { service } = buildTier({ coupon: { tierId: undefined } });
    await expect(
      service.choosePlan('aluno-1', { ...PACOTE_PIX, couponCode: 'BEMVINDA' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('restrito ao PIX: recusado no cartão', async () => {
    const { service } = buildTier({
      coupon: { paymentModes: ['PACKAGE_PIX'] },
    });
    await expect(
      service.choosePlan('aluno-1', {
        ...PACOTE_CARTAO,
        couponCode: 'BEMVINDA',
      }),
    ).rejects.toThrow(/forma de pagamento/);
    await expect(
      service.choosePlan('aluno-1', { ...PACOTE_PIX, couponCode: 'BEMVINDA' }),
    ).resolves.toBeDefined();
  });

  it('restrito ao PIX: trocar para o cartão depois também é recusado', async () => {
    const { service } = buildTier({
      coupon: { paymentModes: ['PACKAGE_PIX'] },
    });
    await service.choosePlan('aluno-1', {
      ...PACOTE_PIX,
      couponCode: 'BEMVINDA',
    });

    await expect(
      service.changePaymentMethod('aluno-1', {
        paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      }),
    ).rejects.toThrow(/forma de pagamento/);
  });

  it('esgotado é recusado', async () => {
    const { service } = buildTier({ coupon: { maxUses: 3, usedCount: 3 } });
    await expect(
      service.choosePlan('aluno-1', { ...PACOTE_PIX, couponCode: 'BEMVINDA' }),
    ).rejects.toThrow(/esgotado/);
  });

  it('inativo é recusado', async () => {
    const { service } = buildTier({ coupon: { active: false } });
    await expect(
      service.choosePlan('aluno-1', { ...PACOTE_PIX, couponCode: 'BEMVINDA' }),
    ).rejects.toThrow(/inválido/);
  });
});

describe('Cupom por tier — assinatura', () => {
  it('vale pelas mensalidades da duração', async () => {
    const { service, subscriptions } = buildTier({
      coupon: {
        discountValue: 20,
        durationMonths: 2,
        paymentModes: ['SUBSCRIPTION'],
      },
    });

    await service.choosePlan('aluno-1', {
      ...ASSINATURA,
      couponCode: 'BEMVINDA',
    });

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.charges.slice(0, 4).map((charge) => charge.amount)).toEqual([
      300, 300, 320, 320,
    ]);
  });

  it('percentual sobre a mensalidade', async () => {
    const { service, subscriptions } = buildTier({
      coupon: {
        discountType: 'percent',
        discountValue: 25,
        durationMonths: null,
      },
    });

    await service.choosePlan('aluno-1', {
      ...ASSINATURA,
      couponCode: 'BEMVINDA',
    });

    expect(subscriptions.store.get('aluno-1')!.charges[0].amount).toBe(240);
  });

  it('restrito ao pacote: recusado na assinatura', async () => {
    const { service } = buildTier({
      coupon: { paymentModes: ['PACKAGE_PIX', 'PACKAGE_CARD'] },
    });
    await expect(
      service.choosePlan('aluno-1', { ...ASSINATURA, couponCode: 'BEMVINDA' }),
    ).rejects.toThrow(/forma de pagamento/);
  });
});

describe('Cupom por tier — contagem de usos', () => {
  it('conta no pagamento confirmado, não na aplicação', async () => {
    const { service, coupons } = buildTier({ coupon: {} });

    await service.choosePlan('aluno-1', {
      ...PACOTE_PIX,
      couponCode: 'BEMVINDA',
    });
    expect(coupons.incrementUsage).not.toHaveBeenCalled();

    await service.handleMercadoPagoEvent(orderPaga('pix_1'));
    expect(coupons.incrementUsage).toHaveBeenCalledWith('BEMVINDA');
  });

  it('conta uma vez só, mesmo com o webhook reenviado e as renovações', async () => {
    const { service, coupons, card } = buildTier({
      coupon: { durationMonths: null, paymentModes: undefined },
    });
    card.createCheckout.mockResolvedValue({
      id: 'pre_1',
      subscriptionId: 'pre_1',
      provider: 'MERCADOPAGO',
      outcome: 'PENDING',
    });
    await service.choosePlan('aluno-1', {
      ...ASSINATURA,
      couponCode: 'BEMVINDA',
    });
    await service.payWithCard('aluno-1', CARTAO);

    for (const id of [1, 2]) {
      await service.handleMercadoPagoEvent({
        topic: 'subscription_authorized_payment',
        id: `ap_${id}`,
        cycle: {
          id: `ap_${id}`,
          preapproval_id: 'pre_1',
          status: 'processed',
          payment: { id, status: 'approved', status_detail: 'accredited' },
        },
      } as any);
    }

    expect(coupons.incrementUsage).toHaveBeenCalledTimes(1);
  });

  it('falha ao contar não derruba a confirmação do pagamento', async () => {
    const { service, coupons, subscriptions } = buildTier({ coupon: {} });
    coupons.incrementUsage.mockRejectedValue(new Error('firestore fora'));
    await service.choosePlan('aluno-1', {
      ...PACOTE_PIX,
      couponCode: 'BEMVINDA',
    });

    await service.handleMercadoPagoEvent(orderPaga('pix_1'));

    expect(subscriptions.store.get('aluno-1')!.paidInstallments).toBe(6);
  });
});

describe('Cupom por tier — validação para a tela', () => {
  it('com o contexto, devolve o desconto em reais já calculado', async () => {
    const { service } = buildTier({
      coupon: { discountType: 'percent', discountValue: 10 },
    });

    await expect(
      service.validateCoupon('bemvinda', {
        tierId: 'private',
        plan: TIER_PLANS.PACKAGE,
        paymentMethod: PAYMENT_METHODS.PIX_RECURRING,
      }),
    ).resolves.toMatchObject({
      code: 'BEMVINDA',
      discountAmount: 180,
      discountType: 'percent',
      discountValue: 10,
      tierId: 'private',
    });
  });

  it('com o contexto errado, devolve o motivo', async () => {
    const { service } = buildTier({ coupon: { tierId: 'weekly-group' } });
    await expect(
      service.validateCoupon('BEMVINDA', {
        tierId: 'private',
        plan: TIER_PLANS.PACKAGE,
        paymentMethod: PAYMENT_METHODS.PIX_RECURRING,
      }),
    ).rejects.toThrow(/não vale para este plano/);
  });
});

describe('Cupom — criação pela gerente', () => {
  it('cria cupom de tier com tipo, formas de pagamento e limite', async () => {
    const { service, coupons } = buildTier();

    const created = await service.createCoupon(
      {
        code: ' promo10 ',
        tierId: 'private',
        discountType: 'percent',
        discountValue: 10,
        paymentModes: ['PACKAGE_PIX'],
        maxUses: 20,
      },
      'gerente-1',
    );

    expect(created).toMatchObject({
      code: 'PROMO10',
      tierId: 'private',
      discountType: 'percent',
      discountValue: 10,
      paymentModes: ['PACKAGE_PIX'],
      maxUses: 20,
      usedCount: 0,
      active: true,
    });
    expect(coupons.create).toHaveBeenCalled();
  });

  it('percentual acima de 100 é recusado', async () => {
    const { service } = buildTier();
    await expect(
      service.createCoupon(
        {
          code: 'X',
          tierId: 'private',
          discountType: 'percent',
          discountValue: 120,
        },
        'gerente-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('o formato antigo (discountAmount, sem tier) ainda é aceito até o front novo entrar', async () => {
    const { service } = buildTier();
    const created = await service.createCoupon(
      { code: 'velho', discountAmount: 50 } as any,
      'gerente-1',
    );
    expect(created).toMatchObject({
      discountType: 'amount',
      discountValue: 50,
      discountAmount: 50,
    });
    expect(created.tierId).toBeUndefined();
  });
});

// Mantém o import usado mesmo se algum caso acima for removido.
void Coupon;
