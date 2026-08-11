import { Injectable } from '@nestjs/common';
import { BillingSummaryService } from '../billing/billing-summary.service';
import { SubscriptionRepository } from '../subscriptions/subscription.repository';
import { InfraExpenseService } from './infra-expense.service';
import { RevenueGoalService } from './revenue-goal.service';
import {
  CHARGE_STATUS,
  SUBSCRIPTION_STATUS,
  Subscription,
  netOfGatewayFee,
} from '../subscriptions/subscription.entity';
import { monthsOfYear } from './infra-expense.entity';
import {
  AnnualOverview,
  ChartData,
  MonthData,
  MonthlyOverview,
} from './manager-finance.entity';
import { todayInAppTimezone } from '../common/time';

/**
 * Visão consolidada do negócio para a gerente (spec 012 RF6, RF7, RF12).
 *
 * Junta três fontes que já existiam separadas: a receita das assinaturas
 * (spec 012), a folha das professoras (spec 010) e o custo de infraestrutura
 * (RF9). O ponto delicado é a **regra da gerente**: as horas dela não são
 * despesa — ela fica com o lucro, não com o valor-hora (RF11). O fechamento já
 * marca cada linha com `isManager`, então basta não somá-la aqui.
 */
@Injectable()
export class ManagerFinanceService {
  constructor(
    private readonly billingSummary: BillingSummaryService,
    private readonly subscriptions: SubscriptionRepository,
    private readonly infraExpenses: InfraExpenseService,
    private readonly goals: RevenueGoalService,
  ) {}

  async getMonthlyOverview(month: string): Promise<MonthlyOverview> {
    const [revenue, teacherExpenses, infraExpenses, goals] = await Promise.all([
      this.revenueForMonth(month),
      this.teacherExpensesForMonth(month),
      this.infraExpenses.getForMonth(month),
      this.goals.getGoals(Number(month.slice(0, 4))),
    ]);

    return {
      month,
      revenue: revenue.total,
      teacherExpenses,
      infraExpenses,
      profit: round2(revenue.total - teacherExpenses - infraExpenses),
      activeStudents: revenue.activeStudents,
      goalTarget: goals.monthlyTargets?.[month.slice(5, 7)],
    };
  }

  /**
   * Os doze meses do ano. As buscas pesadas (assinaturas e infra) são feitas
   * uma única vez e recortadas em memória — doze idas ao Firestore por
   * abertura de tela não se justificam para um painel que a gerente atualiza
   * o dia inteiro.
   */
  async getAnnualOverview(year: number): Promise<AnnualOverview> {
    const months = monthsOfYear(year);
    const [active, infraBreakdown, goals, teacherExpenses] = await Promise.all([
      this.activeSubscriptions(),
      this.infraExpenses.getAnnualBreakdown(year),
      this.goals.getGoals(year),
      Promise.all(months.map((month) => this.teacherExpensesForMonth(month))),
    ]);

    const data: MonthData[] = months.map((month, index) => {
      const revenue = sumScheduledCharges(active, month);
      const infra = infraBreakdown[index].amount;
      const teachers = teacherExpenses[index];
      return {
        month,
        revenue,
        teacherExpenses: teachers,
        infraExpenses: infra,
        profit: round2(revenue - teachers - infra),
      };
    });

    const totalRevenue = round2(sum(data.map((item) => item.revenue)));
    const totalExpenses = round2(
      sum(data.map((item) => item.teacherExpenses + item.infraExpenses)),
    );

    return {
      year,
      months: data,
      totalRevenue,
      totalExpenses,
      totalProfit: round2(totalRevenue - totalExpenses),
      annualTarget: goals.annualTarget,
    };
  }

  /**
   * Mesmo recorte do anual, já no formato que o gráfico consome (RF12): as
   * duas despesas empilhadas em categorias separadas e a receita por cima.
   */
  async getChartData(year: number): Promise<ChartData> {
    const annual = await this.getAnnualOverview(year);
    return {
      year,
      labels: annual.months.map((item) => MONTH_LABELS[monthIndex(item.month)]),
      datasets: [
        {
          label: 'Professoras',
          data: annual.months.map((item) => item.teacherExpenses),
          colorToken: 'primary',
          kind: 'bar',
          stack: 'despesas',
        },
        {
          label: 'Infraestrutura',
          data: annual.months.map((item) => item.infraExpenses),
          colorToken: 'accent',
          kind: 'bar',
          stack: 'despesas',
        },
        {
          label: 'Receita',
          data: annual.months.map((item) => item.revenue),
          colorToken: 'success',
          kind: 'line',
        },
      ],
    };
  }

  // ------------------------------------------------------------ internos

  /**
   * Receita do mês = soma das parcelas com vencimento nele, entre as
   * assinaturas ativas (§5). Não é a soma do valor dos planos: um anual de
   * R$ 2.280 pesa R$ 190 em cada mês, não R$ 2.280 no mês da contratação.
   */
  private async revenueForMonth(
    month: string,
  ): Promise<{ total: number; activeStudents: number }> {
    const active = await this.activeSubscriptions();
    return {
      total: sumScheduledCharges(active, month),
      activeStudents: active.length,
    };
  }

  private async activeSubscriptions(): Promise<Subscription[]> {
    return this.subscriptions.findByStatus(SUBSCRIPTION_STATUS.ACTIVE);
  }

  /** Folha do mês **sem** a gerente — as horas dela não são despesa (RF11). */
  private async teacherExpensesForMonth(month: string): Promise<number> {
    const closings = await this.billingSummary.summary(month);
    return round2(
      sum(
        closings
          .filter((closing) => !closing.isManager)
          .map((closing) => closing.total),
      ),
    );
  }
}

/**
 * Parcelas de um mês entre várias assinaturas. Cobrança já paga continua
 * contando: ela é receita **daquele** mês, e retirá-la faria o faturamento
 * passado encolher conforme o tempo passa.
 *
 * **O que entra aqui é líquido da taxa do gateway** (spec 023): o painel
 * responde "quanto entrou no caixa", e o bruto responde outra pergunta. A taxa
 * é aplicada **na soma**, não em cada parcela, porque arredondar doze vezes
 * acumula centavos que ninguém consegue explicar depois.
 *
 * Os juros que a aluna paga ao parcelar **não** aparecem: eles ficam com o
 * provedor e nunca chegam ao caixa. Contá-los infla o faturamento em quase
 * quinhentos reais por plano Anual.
 */
function sumScheduledCharges(
  subscriptions: Subscription[],
  month: string,
): number {
  return netOfGatewayFee(
    sum(
      subscriptions.flatMap((subscription) =>
        subscription.charges
          .filter(
            (charge) =>
              charge.dueDate.startsWith(month) &&
              charge.status !== CHARGE_STATUS.OVERDUE,
          )
          .map((charge) => charge.amount),
      ),
    ),
  );
}

export const MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

function monthIndex(month: string): number {
  return Number(month.slice(5, 7)) - 1;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Mês corrente no fuso da operação, atalho para os controllers. */
export function currentMonth(): string {
  return todayInAppTimezone().slice(0, 7);
}
