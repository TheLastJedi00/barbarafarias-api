import { Injectable, Optional } from '@nestjs/common';
import { EnrollmentRepository } from '../enrollments/enrollment.repository';
import {
  ENROLLMENT_STATUS,
  type Enrollment,
} from '../enrollments/enrollment.model';
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
  ManualPaymentsMonth,
  MonthData,
  MonthlyOverview,
} from './manager-finance.entity';
import { todayInAppTimezone, toZonedDateString } from '../common/time';
import { StorePurchaseRepository } from '../store/store-purchase.repository';
import {
  STORE_PURCHASE_STATUS,
  StorePurchase,
} from '../store/store-purchase.model';
import { ManualPaymentRepository } from '../manual-payments/manual-payment.repository';
import {
  ManualPayment,
  isCounted,
  isCourtesy,
} from '../manual-payments/manual-payment.entity';

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
    private readonly manualPayments: ManualPaymentRepository,
    private readonly storePurchases: StorePurchaseRepository,
    @Optional() private readonly enrollments?: EnrollmentRepository,
  ) {}

  async getMonthlyOverview(month: string): Promise<MonthlyOverview> {
    const [revenue, teacherExpenses, infraExpenses, goals, cancelled] =
      await Promise.all([
        this.revenueForMonth(month),
        this.teacherExpensesForMonth(month),
        this.infraExpenses.getForMonth(month),
        this.goals.getGoals(Number(month.slice(0, 4))),
        this.subscriptions.findByStatus(SUBSCRIPTION_STATUS.CANCELLED),
      ]);

    return {
      month,
      revenue: revenue.total,
      manualRevenue: revenue.manual,
      storeRevenue: revenue.store,
      enrollmentRevenue: revenue.enrollment,
      enrollmentDeposits: revenue.deposits,
      teacherExpenses,
      infraExpenses,
      profit: round2(revenue.total - teacherExpenses - infraExpenses),
      activeStudents: revenue.activeStudents,
      fidelityBreaks: countFidelityBreaks(cancelled, month),
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
    const [
      active,
      infraBreakdown,
      goals,
      teacherExpenses,
      manual,
      store,
      enrollments,
    ] = await Promise.all([
      this.activeSubscriptions(),
      this.infraExpenses.getAnnualBreakdown(year),
      this.goals.getGoals(year),
      Promise.all(months.map((month) => this.teacherExpensesForMonth(month))),
      this.manualPayments.findByYear(year),
      this.storePurchases.findAll(),
      this.allEnrollments(),
    ]);

    const data: MonthData[] = months.map((month, index) => {
      const revenue = round2(
        sumScheduledCharges(active, month) +
          sumManualPayments(manual, month) +
          sumStoreSales(store, month) +
          sumEnrollmentRevenue(enrollments, month),
      );
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

  /** Lista "Recebido por fora" do mês (spec 026 §10.3), do mais antigo ao mais novo. */
  async getManualPayments(month: string): Promise<ManualPaymentsMonth> {
    const payments = await this.manualPayments.findByMonth(month);
    return {
      month,
      total: sumManualPayments(payments, month),
      courtesies: payments.filter(isCourtesy).length,
      items: payments.map((payment) => ({
        id: payment.id,
        studentId: payment.studentId,
        studentName: payment.studentName,
        amount: payment.amount,
        grantedAt: payment.grantedAt,
        accessUntil: payment.accessUntil,
        courtesy: isCourtesy(payment),
        voided: !isCounted(payment),
        voidedAt: payment.voidedAt,
      })),
    };
  }

  // ------------------------------------------------------------ internos

  /**
   * Receita do mês = soma das parcelas com vencimento nele, entre as
   * assinaturas ativas (§5), **mais o recebido por fora** (spec 026 §9). Não é
   * a soma do valor dos planos: um anual de R$ 2.280 pesa R$ 190 em cada mês,
   * não R$ 2.280 no mês da contratação.
   */
  private async revenueForMonth(month: string): Promise<{
    total: number;
    manual: number;
    store: number;
    enrollment: number;
    deposits: number;
    activeStudents: number;
  }> {
    const [active, manual, store, enrollments] = await Promise.all([
      this.activeSubscriptions(),
      this.manualPayments.findByMonth(month),
      this.storePurchases.findAll(),
      this.allEnrollments(),
    ]);
    const manualTotal = sumManualPayments(manual, month);
    const storeTotal = sumStoreSales(store, month);
    const enrollmentTotal = sumEnrollmentRevenue(enrollments, month);
    return {
      total: round2(
        sumScheduledCharges(active, month) +
          manualTotal +
          storeTotal +
          enrollmentTotal,
      ),
      manual: manualTotal,
      store: storeTotal,
      enrollment: enrollmentTotal,
      deposits: sumEnrollmentDeposits(enrollments, month),
      activeStudents: countPayingStudents(active, manual, month),
    };
  }

  private async allEnrollments(): Promise<Enrollment[]> {
    return this.enrollments ? this.enrollments.findAll() : [];
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

/**
 * Quebras de fidelidade num mês, pela data de Brasília (spec 035): a assinatura
 * encerrada às 22h do dia 31 é do mês que termina, não do seguinte.
 */
export function countFidelityBreaks(
  subscriptions: Subscription[],
  month: string,
): number {
  return subscriptions.filter(
    (subscription) =>
      subscription.fidelityBrokenAt &&
      toZonedDateString(new Date(subscription.fidelityBrokenAt)).startsWith(
        month,
      ),
  ).length;
}

/**
 * Recebido por fora do gateway num mês (spec 026 §9). **Regime de caixa**,
 * como o PIX da spec 024: o valor inteiro é receita do mês em que a gerente o
 * registrou. **Sem** `netOfGatewayFee` — o dinheiro não passou por gateway,
 * não há taxa a descontar. Estornado não soma: o estorno existe para "o
 * pagamento não entrou", e dinheiro que não entrou nunca foi receita daquele
 * mês. Cortesia soma zero, mas continua na lista do mês.
 */
export function sumManualPayments(
  payments: ManualPayment[],
  month: string,
): number {
  return round2(
    sum(
      payments
        .filter((payment) => payment.month === month && isCounted(payment))
        .map((payment) => payment.amount),
    ),
  );
}

/**
 * Alunos ativos **pagantes** do mês: quem tem assinatura ativa, mais quem pagou
 * por fora naquele mês (spec 026 §10.3). Cortesia não entra — não é aluno
 * pagante —, nem lançamento estornado. Quem tem as duas coisas conta uma vez.
 */
export function countPayingStudents(
  subscriptions: Subscription[],
  payments: ManualPayment[],
  month: string,
): number {
  const paying = new Set(
    subscriptions.map((subscription) => subscription.studentId),
  );
  for (const payment of payments) {
    if (payment.month === month && isCounted(payment) && payment.amount > 0) {
      paying.add(payment.studentId);
    }
  }
  return paying.size;
}

/**
 * Vendas da loja num mês (spec 032). **Regime de caixa**: o preço inteiro é
 * receita do mês do pagamento, no fuso da operação — compra avulsa não tem
 * cronograma para diluir.
 *
 * Só `PAID` soma: a compra **reembolsada** ou **contestada** deixa de contar no
 * mês em que foi paga, porque o dinheiro voltou. **Líquido da taxa do
 * gateway**, como as assinaturas — passou pelo Mercado Pago. Os juros do
 * parcelamento são do comprador e não aparecem aqui.
 *
 * O comprador de módulo não entra em "alunos ativos": ele não é aluno pagante
 * do plano, e somá-lo misturaria duas réguas no mesmo número.
 */
export function sumStoreSales(
  purchases: StorePurchase[],
  month: string,
): number {
  return netOfGatewayFee(
    sum(
      purchases
        .filter(
          (purchase) =>
            purchase.status === STORE_PURCHASE_STATUS.PAID &&
            !!purchase.paidAt &&
            toZonedDateString(new Date(purchase.paidAt)).startsWith(month),
        )
        .map((purchase) => purchase.priceSnapshot),
    ),
  );
}

/**
 * Sinais das turmas que **começaram** no mês (spec 036 §5): receita na
 * competência do início, junto com o plano. Líquido da taxa, como a loja.
 */
export function sumEnrollmentRevenue(
  enrollments: Enrollment[],
  month: string,
): number {
  return netOfGatewayFee(
    sum(
      enrollments
        .filter(
          (e) =>
            e.status === ENROLLMENT_STATUS.CONVERTED &&
            !!e.startDate &&
            e.startDate.startsWith(month),
        )
        .map((e) => e.feeAmount),
    ),
  );
}

/**
 * Sinais pagos no mês de turmas ainda em formação: dinheiro em caixa que
 * ainda não é receita — vira receita no início, ou volta no estorno.
 */
export function sumEnrollmentDeposits(
  enrollments: Enrollment[],
  month: string,
): number {
  return netOfGatewayFee(
    sum(
      enrollments
        .filter(
          (e) =>
            e.status === ENROLLMENT_STATUS.PAID &&
            !!e.paidAt &&
            toZonedDateString(new Date(e.paidAt)).startsWith(month),
        )
        .map((e) => e.feeAmount),
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
