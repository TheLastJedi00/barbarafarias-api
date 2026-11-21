import type { PlanTierId } from '../plan-tiers/plan-tier.model';

/** Desconto em reais ou em percentual do preço (spec 035 §6). */
export const DISCOUNT_TYPES = { AMOUNT: 'amount', PERCENT: 'percent' } as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[keyof typeof DISCOUNT_TYPES];

/**
 * Onde o cupom vale (spec 035 §6). Ausente = em todas.
 *
 * O pacote se divide em dois porque PIX e cartão podem ter política diferente
 * — o PIX à vista não paga taxa de parcelamento, e é natural a gerente querer
 * premiar só ele.
 */
export const COUPON_PAYMENT_MODES = {
  PACKAGE_PIX: 'PACKAGE_PIX',
  PACKAGE_CARD: 'PACKAGE_CARD',
  SUBSCRIPTION: 'SUBSCRIPTION',
} as const;
export type CouponPaymentMode =
  (typeof COUPON_PAYMENT_MODES)[keyof typeof COUPON_PAYMENT_MODES];

/**
 * Cupom de desconto criado pela gerente (spec 012 RF15; por tier desde a 035).
 *
 * É um cupom **nosso**, não o do gateway: o desconto precisa ser em reais e
 * durar um número de parcelas da assinatura, e o cupom do gateway modela outra
 * coisa (percentual/fixo com limite de resgates, sem noção de duração). Manter
 * o cálculo aqui também deixa o valor da parcela correto antes de a cobrança
 * sequer existir, que é o que a tela do aluno mostra (RF16).
 */
export class Coupon {
  id!: string;
  /** Sempre em maiúsculas; é a chave de busca e não se repete. */
  code!: string;
  /**
   * Tier em que o cupom vale. **Ausente = cupom antigo**, anterior à spec 035:
   * vale só nos planos antigos, nunca num tier.
   */
  tierId?: PlanTierId;
  /** Cupom antigo é sempre `amount`. */
  discountType!: DiscountType;
  /** Em R$ (`amount`) ou em % (`percent`), conforme o tipo. */
  discountValue!: number;
  /**
   * **Obsoleto**, só para o front de antes da spec 035 continuar lendo a
   * lista: o mesmo número de `discountValue` quando o tipo é `amount`.
   */
  discountAmount?: number;
  /**
   * Por quantas parcelas vale. `null` = vitalício. No pacote não se aplica: o
   * desconto é sobre o valor inteiro, uma vez.
   */
  durationMonths!: number | null;
  /** Ausente = vale em todas as formas de pagamento. */
  paymentModes?: CouponPaymentMode[];
  /** Ausente ou `null` = ilimitado. */
  maxUses?: number | null;
  /** Pagamentos confirmados com o cupom. Sobe no pagamento, não na aplicação. */
  usedCount!: number;
  active!: boolean;
  createdAt!: string;
  createdBy!: string;

  constructor(data: Partial<Coupon> = {}) {
    Object.assign(this, data);
    this.discountType ??= DISCOUNT_TYPES.AMOUNT;
    this.discountValue ??= data.discountAmount ?? 0;
    this.usedCount ??= 0;
    this.discountAmount =
      this.discountType === DISCOUNT_TYPES.AMOUNT ? this.discountValue : undefined;
  }
}

/** Normaliza o que o aluno digitou para a forma canônica do código. */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Quanto o cupom abate de `base`, em reais. Nunca mais que a própria base —
 * devolver dinheiro não é desconto.
 */
export function discountFor(
  coupon: Pick<Coupon, 'discountValue'> & { discountType?: DiscountType },
  base: number,
): number {
  const bruto =
    coupon.discountType === DISCOUNT_TYPES.PERCENT
      ? round2((base * coupon.discountValue) / 100)
      : coupon.discountValue;
  return Math.min(round2(bruto), round2(base));
}

/**
 * Aplica o desconto sem deixar a parcela negativa (RF15). O piso é zero: uma
 * parcela de R$ 0 é legítima (cupom cobre o mês inteiro), devolver dinheiro não.
 */
export function applyDiscount(amount: number, discount: number): number {
  return Math.max(0, round2(amount - discount));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
