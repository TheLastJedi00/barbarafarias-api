import { SubscriptionService } from './subscription.service';
import {
  PAYMENT_METHODS,
  TIER_PLANS,
  Subscription,
} from './subscription.entity';
import { Coupon } from './coupon.entity';
import type { PlanTier } from '../plan-tiers/plan-tier.model';
import { DEFAULT_TIERS } from '../plan-tiers/plan-tier.model';

/**
 * Dublês das suítes de tier (spec 035). Ficam fora dos `.spec.ts` porque
 * importar um spec de outro registra os testes dele duas vezes.
 */
export function fakeSubscriptionRepository() {
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
  const config = { get: jest.fn((_key: string): string | undefined => undefined) };
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
    config,
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
