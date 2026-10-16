/** Formas do painel financeiro da gerente (spec 012 RF6–RF12). */

export interface MonthlyOverview {
  /** 'YYYY-MM'. */
  month: string;
  /**
   * Parcelas programadas para o mês nas assinaturas ativas (§5) **mais** o
   * recebido por fora (spec 026).
   */
  revenue: number;
  /** Parte da receita que entrou por fora do gateway (spec 026 §9). */
  manualRevenue: number;
  /** Folha das professoras no fechamento do mês, sem a gerente (RF11). */
  teacherExpenses: number;
  /** Snapshot de infraestrutura vigente naquele mês (RF10). */
  infraExpenses: number;
  /** Receita − despesas. Pode ser negativo. */
  profit: number;
  /** Assinaturas ativas que sustentam a projeção. */
  activeStudents: number;
  /** Meta do mês, quando a gerente definiu uma (RF8). */
  goalTarget?: number;
}

export interface MonthData {
  month: string;
  revenue: number;
  teacherExpenses: number;
  infraExpenses: number;
  profit: number;
}

export interface AnnualOverview {
  year: number;
  months: MonthData[];
  /** Totais do ano, para o cabeçalho do painel. */
  totalRevenue: number;
  totalExpenses: number;
  totalProfit: number;
  annualTarget?: number;
}

export interface ChartDataset {
  label: string;
  data: number[];
  /** Chave semântica de cor; o frontend resolve para o token do tema (RF12). */
  colorToken: 'primary' | 'accent' | 'success' | 'danger';
  kind: 'bar' | 'line';
  /** Barras da mesma pilha somam a despesa total do mês. */
  stack?: string;
}

export interface ChartData {
  year: number;
  labels: string[];
  datasets: ChartDataset[];
}

/**
 * Linha da lista "Recebido por fora" (spec 026 §10.3). Traz cortesias e
 * estornados, marcados, para a gerente conferir o mês — a soma do overview só
 * conta os que valem.
 */
export interface ManualPaymentLine {
  id: string;
  studentId: string;
  studentName?: string;
  amount: number;
  grantedAt: string;
  accessUntil: string;
  courtesy: boolean;
  voided: boolean;
  voidedAt?: string;
}

export interface ManualPaymentsMonth {
  month: string;
  /** Soma do que vale (sem estornados). */
  total: number;
  /** Quantas cortesias o mês teve, estornadas ou não. */
  courtesies: number;
  items: ManualPaymentLine[];
}
