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
 * centavos acontece só na fronteira com o gateway.
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
   * Id da cobrança no gateway que a emitiu — a order do Mercado Pago. É por
   * ele que o webhook volta à assinatura.
   */
  gatewayChargeId?: string;
  /**
   * Quem processou. O que **gravamos** sai sempre de `GATEWAY_PROVIDERS`, que
   * hoje tem um valor só; o tipo é aberto porque **parcelas antigas continuam
   * no Firestore com provedores que não existem mais no código** (spec 023
   * §6). Apagar gateway é código; apagar histórico seria receita — e o painel
   * financeiro soma essas parcelas normalmente.
   */
  gatewayProvider?: string;
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
   * Até quando o acesso vale, independente do status (spec 023 P1).
   *
   * Existe porque **cancelar não devolve dinheiro**. No Semestral e no Anual a
   * compra é debitada de uma vez e quem divide em parcelas é o emissor do
   * cartão: cancelar aqui não interrompe a fatura da aluna. Derrubar o acesso
   * na hora significava tirar dela o que já estava pago enquanto o banco
   * seguia cobrando — o pior dos dois lados.
   *
   * No mensal a lógica é a mesma com outra conta: o ciclo já pago vale até o
   * fim, e o que o cancelamento evita são os **próximos**.
   *
   * Ausente enquanto nada foi pago: aí não há acesso comprado a preservar.
   */
  accessUntil?: string;

  /**
   * Assinatura recorrente no gateway, **só no cartão**.
   *
   * É o elo com quem emite as renovações: sem ele, cancelar aqui deixaria o
   * cartão sendo debitado todo mês lá fora. No PIX fica sempre vazio, e isso
   * não é omissão — não existe assinatura lá fora para o PIX: cada QR é uma
   * compra à vista, e "renovar" é o aluno pagar o próximo.
   *
   * O nome deixou de citar o fornecedor (era `stripeSubscriptionId`) na spec
   * 023: um campo batizado por *vendor* obriga a renomear a cada troca, que é
   * exatamente o trabalho que as portas existem para evitar.
   */
  gatewaySubscriptionId?: string;

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

/**
 * Até quando o que **já foi pago** dá acesso.
 *
 * Uma conta só, que serve aos dois regimes porque a diferença está em quantos
 * meses foram comprados de fato:
 *
 * - **plano fechado** (Semestral, Anual): a compra inteira foi debitada, então
 *   valem todos os meses do plano;
 * - **mensal**: vale um mês por ciclo pago, e o próximo só existe se for pago.
 *
 * Devolve `undefined` quando nada foi pago — não há acesso comprado a proteger.
 */
export function paidAccessUntil(subscription: {
  plan: SubscriptionPlan;
  startDate: string;
  installments: number;
  paidInstallments: number;
}): string | undefined {
  if (!subscription.paidInstallments) return undefined;

  const meses = PLAN_CONFIGS[subscription.plan].recurring
    ? subscription.paidInstallments
    : subscription.installments;

  return addMonths(subscription.startDate, meses);
}

/**
 * Soma meses a uma data 'YYYY-MM-DD' preservando o dia. Dia 31 em mês curto
 * cai no último dia do mês (31/jan + 1 mês = 28/fev), que é o comportamento
 * esperado de mensalidade — `Date.UTC` sozinho estouraria para março.
 */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
