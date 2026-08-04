/**
 * Assinatura do aluno (spec 012 RF2). Substitui o `isPaying` manual como fonte
 * da verdade sobre quem está em dia — o booleano continua existindo, mas passa
 * a ser derivado daqui quando há assinatura (RF13 / Task 18).
 */

import type { GatewayProvider } from './payment.gateway';

/** Os três planos vendidos. Não há plano avulso. */
export const SUBSCRIPTION_PLANS = {
  MONTHLY: 'MONTHLY',
  SEMIANNUAL: 'SEMIANNUAL',
  ANNUAL: 'ANNUAL',
} as const;

export type SubscriptionPlan =
  (typeof SUBSCRIPTION_PLANS)[keyof typeof SUBSCRIPTION_PLANS];

export const SUBSCRIPTION_STATUS = {
  /** Plano escolhido, primeira cobrança ainda não confirmada. */
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  /** Parcela vencida sem pagamento — o aluno perde acesso (RF13). */
  PAST_DUE: 'PAST_DUE',
  CANCELLED: 'CANCELLED',
} as const;

export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

export const PAYMENT_METHODS = {
  CREDIT_CARD: 'CREDIT_CARD',
  PIX_RECURRING: 'PIX_RECURRING',
} as const;

export type PaymentMethod =
  (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

export const CHARGE_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  OVERDUE: 'overdue',
} as const;

export type ChargeStatus = (typeof CHARGE_STATUS)[keyof typeof CHARGE_STATUS];

/**
 * Configuração fixa de cada plano (RF2). Os valores vivem em **reais** como no
 * resto do sistema (`hourlyRate`, `total` do fechamento); a conversão para
 * centavos acontece só na fronteira com o AbacatePay.
 */
export interface PlanConfig {
  plan: SubscriptionPlan;
  label: string;
  totalAmount: number;
  /** Quantas cobranças fecham o plano. Recorrente não tem fim — ver `recurring`. */
  installments: number;
  installmentAmount: number;
  /**
   * Plano sem fim: renova enquanto ninguém cancelar. Só o mensal é assim; o
   * cronograma dele é uma projeção das próximas renovações, não um parcelamento.
   */
  recurring: boolean;
  description: string;
}

/** Quantas renovações do plano mensal o cronograma projeta à frente (§2). */
export const RECURRING_SCHEDULE_MONTHS = 6;

export const PLAN_CONFIGS: Record<SubscriptionPlan, PlanConfig> = {
  [SUBSCRIPTION_PLANS.MONTHLY]: {
    plan: SUBSCRIPTION_PLANS.MONTHLY,
    label: 'Mensal',
    totalAmount: 240,
    installments: 1,
    installmentAmount: 240,
    recurring: true,
    description: 'Renova todo mês. Cancele quando quiser.',
  },
  [SUBSCRIPTION_PLANS.SEMIANNUAL]: {
    plan: SUBSCRIPTION_PLANS.SEMIANNUAL,
    label: 'Semestral',
    totalAmount: 1200,
    installments: 6,
    installmentAmount: 200,
    recurring: false,
    description: 'Seis meses em 6x. Economia de R$ 240 no período.',
  },
  [SUBSCRIPTION_PLANS.ANNUAL]: {
    plan: SUBSCRIPTION_PLANS.ANNUAL,
    label: 'Anual',
    totalAmount: 2280,
    installments: 12,
    installmentAmount: 190,
    recurring: false,
    description: 'Doze meses em 12x. O melhor valor por aula.',
  },
};

export function planConfig(plan: SubscriptionPlan): PlanConfig {
  return PLAN_CONFIGS[plan];
}

/** Uma cobrança do cronograma. `index` é 1-based para casar com "parcela 3/6". */
export interface Charge {
  index: number;
  /** ISO date (YYYY-MM-DD). */
  dueDate: string;
  amount: number;
  status: ChargeStatus;
  paidAt?: string;
  /**
   * Id da cobrança no gateway que a emitiu — cobrança do AbacatePay ou sessão
   * de checkout do Stripe. É por ele que o webhook volta à assinatura.
   */
  gatewayChargeId?: string;
  gatewayProvider?: GatewayProvider;
  /**
   * @deprecated Nome anterior de `gatewayChargeId`, de quando só havia o
   * AbacatePay. Continua sendo lido e gravado pelo repositório para as
   * assinaturas criadas antes da spec 014 — ninguém deve ler daqui.
   */
  abacatePayId?: string;
}

export class Subscription {
  /** Igual ao `studentId`: um aluno tem no máximo uma assinatura viva. */
  id!: string;
  studentId!: string;
  plan!: SubscriptionPlan;
  status!: SubscriptionStatus;
  paymentMethod!: PaymentMethod;
  totalAmount!: number;
  installments!: number;
  installmentAmount!: number;
  paidInstallments!: number;
  charges!: Charge[];
  /** ISO date do início do plano. */
  startDate!: string;
  nextChargeDate?: string;
  cancelledAt?: string;

  /**
   * Assinatura recorrente no Stripe (`sub_…`), quando o plano é de cartão
   * (spec 014). É o elo com quem emite as renovações: sem ele, cancelar aqui
   * deixaria o cartão sendo debitado todo mês lá fora.
   */
  stripeSubscriptionId?: string;

  // --- cupom aplicado (RF15/RF16) ---
  couponCode?: string;
  /** Desconto em R$ por parcela, já validado contra o valor da parcela. */
  couponDiscount?: number;
  /**
   * Por quantas parcelas o desconto vale, contadas do começo do plano.
   * `null` = vitalício (vale enquanto a assinatura durar). Ausente quando não
   * há cupom. É o que decide o valor das renovações projetadas depois.
   */
  couponRemainingCharges?: number | null;

  createdAt!: string;
  updatedAt!: string;

  constructor(data: Partial<Subscription> = {}) {
    Object.assign(this, data);
  }
}

/** A assinatura garante acesso enquanto estiver ativa (RF13). */
export function grantsAccess(status: SubscriptionStatus): boolean {
  return status === SUBSCRIPTION_STATUS.ACTIVE;
}
