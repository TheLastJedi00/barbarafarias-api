/**
 * Custo fixo de infraestrutura informado pela gerente (spec 012 RF9/RF10).
 *
 * **Modelo de marco temporal, não de campo editável.** Cada alteração grava um
 * registro novo com o mês em que passa a valer; nada é sobrescrito. Assim a
 * rentabilidade de um mês fechado nunca muda por causa de um reajuste feito
 * depois — o gráfico lê o snapshot que vigorava naquele mês (RF10).
 */
export class InfraExpense {
  id!: string;
  /** Valor mensal em R$. */
  monthlyAmount!: number;
  /** 'YYYY-MM' — primeiro mês em que este valor vale. */
  effectiveFrom!: string;
  createdAt!: string;
  /** userId da gerente que registrou. */
  createdBy!: string;

  constructor(data: Partial<InfraExpense> = {}) {
    Object.assign(this, data);
  }
}

/** Uma posição do breakdown anual: quanto de infra pesou naquele mês. */
export interface InfraMonthAmount {
  /** 'YYYY-MM'. */
  month: string;
  amount: number;
}

/**
 * Valor vigente em `month` dada a lista de snapshots: o mais recente cujo
 * `effectiveFrom` não passa do mês consultado. Mês anterior a qualquer
 * snapshot custa zero — não havia despesa registrada ainda.
 */
export function resolveAmountForMonth(
  snapshots: InfraExpense[],
  month: string,
): number {
  const applicable = snapshots
    .filter((snapshot) => snapshot.effectiveFrom <= month)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return applicable.length === 0
    ? 0
    : applicable[applicable.length - 1].monthlyAmount;
}

/** Os doze meses de um ano como 'YYYY-MM'. */
export function monthsOfYear(year: number): string[] {
  return Array.from(
    { length: 12 },
    (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`,
  );
}
