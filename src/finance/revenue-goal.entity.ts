/**
 * Meta de faturamento definida pela gerente (spec 012 RF8).
 *
 * Uma meta por ano. A meta mensal é opcional e granular: quando existe, o
 * painel compara o mês contra ela; quando não, cai na anual dividida por doze.
 */
export class RevenueGoal {
  year!: number;
  annualTarget!: number;
  /** Chave é o mês em dois dígitos ('01'…'12'). */
  monthlyTargets?: Record<string, number>;
  updatedAt!: string;
  updatedBy!: string;

  constructor(data: Partial<RevenueGoal> = {}) {
    this.year = data.year ?? new Date().getUTCFullYear();
    this.annualTarget = data.annualTarget ?? 0;
    this.monthlyTargets = data.monthlyTargets;
    this.updatedAt = data.updatedAt ?? '';
    this.updatedBy = data.updatedBy ?? '';
  }
}

/** '2026-08' ou '08' → '08'. Aceita as duas formas que a rota pode receber. */
export function normalizeMonthKey(month: string): string {
  const key = month.includes('-') ? month.split('-')[1] : month;
  return key.padStart(2, '0');
}
