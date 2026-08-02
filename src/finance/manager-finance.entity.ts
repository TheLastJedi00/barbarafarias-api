/** Formas do painel financeiro da gerente (spec 012 RF6–RF12). */

export interface MonthlyOverview {
  /** 'YYYY-MM'. */
  month: string;
  /** Soma das parcelas programadas para o mês nas assinaturas ativas (§5). */
  revenue: number;
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
