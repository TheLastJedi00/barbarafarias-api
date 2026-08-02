import { BadRequestException } from '@nestjs/common';
import { ManagerFinanceService } from './manager-finance.service';
import { RevenueGoalService } from './revenue-goal.service';
import { RevenueGoal } from './revenue-goal.entity';
import {
  CHARGE_STATUS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUS,
  Subscription,
} from '../subscriptions/subscription.entity';
import type { Charge } from '../subscriptions/subscription.entity';

function charges(
  from: string,
  count: number,
  amount: number,
  status: Charge['status'] = CHARGE_STATUS.PENDING,
): Charge[] {
  const [year, month] = from.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 10));
    return {
      index: index + 1,
      dueDate: date.toISOString().slice(0, 10),
      amount,
      status,
    };
  });
}

function subscription(
  studentId: string,
  plan: keyof typeof SUBSCRIPTION_PLANS,
  list: Charge[],
): Subscription {
  return new Subscription({
    id: studentId,
    studentId,
    plan: SUBSCRIPTION_PLANS[plan],
    status: SUBSCRIPTION_STATUS.ACTIVE,
    charges: list,
  });
}

function build(options: {
  subscriptions?: Subscription[];
  closings?: { isManager: boolean; total: number }[];
  infraByMonth?: number;
  goal?: Partial<RevenueGoal>;
} = {}) {
  const billingSummary = {
    summary: jest.fn().mockResolvedValue(options.closings ?? []),
  };
  const subscriptionRepository = {
    findByStatus: jest.fn().mockResolvedValue(options.subscriptions ?? []),
  };
  const infra = {
    getForMonth: jest.fn().mockResolvedValue(options.infraByMonth ?? 0),
    getAnnualBreakdown: jest.fn(async (year: number) =>
      Array.from({ length: 12 }, (_, index) => ({
        month: `${year}-${String(index + 1).padStart(2, '0')}`,
        amount: options.infraByMonth ?? 0,
      })),
    ),
  };
  const goals = {
    getGoals: jest
      .fn()
      .mockResolvedValue(new RevenueGoal({ year: 2026, ...options.goal })),
  };

  const service = new ManagerFinanceService(
    billingSummary as any,
    subscriptionRepository as any,
    infra as any,
    goals as any,
  );
  return { service, billingSummary, subscriptionRepository, infra, goals };
}

describe('ManagerFinanceService — visão mensal', () => {
  it('projeta a receita somando as parcelas que vencem no mês (§5)', async () => {
    const { service } = build({
      subscriptions: [
        subscription('a1', 'MONTHLY', charges('2026-08', 6, 240)),
        subscription('a2', 'ANNUAL', charges('2026-08', 12, 190)),
        subscription('a3', 'SEMIANNUAL', charges('2026-08', 6, 200)),
      ],
    });

    const overview = await service.getMonthlyOverview('2026-08');

    // 240 + 190 + 200 — o valor da parcela, não o total dos planos.
    expect(overview.revenue).toBe(630);
    expect(overview.activeStudents).toBe(3);
  });

  it('não conta parcela de outro mês', async () => {
    const { service } = build({
      subscriptions: [subscription('a1', 'ANNUAL', charges('2026-08', 12, 190))],
    });

    await expect(
      service.getMonthlyOverview('2026-09'),
    ).resolves.toMatchObject({ revenue: 190 });
    await expect(
      service.getMonthlyOverview('2027-09'),
    ).resolves.toMatchObject({ revenue: 0 });
  });

  it('parcela já paga continua sendo receita do mês dela', async () => {
    const { service } = build({
      subscriptions: [
        subscription(
          'a1',
          'MONTHLY',
          charges('2026-08', 1, 240, CHARGE_STATUS.PAID),
        ),
      ],
    });

    await expect(
      service.getMonthlyOverview('2026-08'),
    ).resolves.toMatchObject({ revenue: 240 });
  });

  it('as horas da gerente ficam fora da despesa (RF11)', async () => {
    const { service } = build({
      subscriptions: [subscription('a1', 'MONTHLY', charges('2026-08', 1, 240))],
      closings: [
        { isManager: false, total: 600 },
        { isManager: true, total: 900 },
      ],
    });

    const overview = await service.getMonthlyOverview('2026-08');

    expect(overview.teacherExpenses).toBe(600);
    expect(overview.profit).toBe(240 - 600);
  });

  it('soma a infraestrutura vigente e fecha o lucro', async () => {
    const { service } = build({
      subscriptions: [
        subscription('a1', 'MONTHLY', charges('2026-08', 1, 1000)),
      ],
      closings: [{ isManager: false, total: 400 }],
      infraByMonth: 150,
    });

    const overview = await service.getMonthlyOverview('2026-08');

    expect(overview.infraExpenses).toBe(150);
    expect(overview.profit).toBe(450);
  });

  it('traz a meta do mês quando a gerente definiu uma', async () => {
    const { service } = build({
      goal: { annualTarget: 60000, monthlyTargets: { '08': 7000 } },
    });

    await expect(
      service.getMonthlyOverview('2026-08'),
    ).resolves.toMatchObject({ goalTarget: 7000 });
  });

  it('mês sem meta própria vem sem alvo', async () => {
    const { service } = build({ goal: { annualTarget: 60000 } });

    await expect(
      service.getMonthlyOverview('2026-08'),
    ).resolves.toMatchObject({ goalTarget: undefined });
  });
});

describe('ManagerFinanceService — visão anual', () => {
  it('devolve os doze meses com totais consolidados', async () => {
    const { service } = build({
      subscriptions: [
        subscription('a1', 'ANNUAL', charges('2026-01', 12, 190)),
      ],
      closings: [{ isManager: false, total: 100 }],
      infraByMonth: 50,
      goal: { annualTarget: 30000 },
    });

    const annual = await service.getAnnualOverview(2026);

    expect(annual.months).toHaveLength(12);
    expect(annual.totalRevenue).toBe(190 * 12);
    expect(annual.totalExpenses).toBe((100 + 50) * 12);
    expect(annual.totalProfit).toBe(190 * 12 - 150 * 12);
    expect(annual.annualTarget).toBe(30000);
  });

  it('mês sem parcela nem despesa fica zerado, não ausente', async () => {
    const { service } = build({
      subscriptions: [
        subscription('a1', 'SEMIANNUAL', charges('2026-01', 6, 200)),
      ],
    });

    const annual = await service.getAnnualOverview(2026);

    expect(annual.months[6]).toMatchObject({
      month: '2026-07',
      revenue: 0,
      profit: 0,
    });
  });
});

describe('ManagerFinanceService — dados do gráfico (RF12)', () => {
  it('separa as despesas em categorias empilhadas e põe a receita como linha', async () => {
    const { service } = build({
      subscriptions: [
        subscription('a1', 'ANNUAL', charges('2026-01', 12, 190)),
      ],
      closings: [{ isManager: false, total: 100 }],
      infraByMonth: 50,
    });

    const chart = await service.getChartData(2026);

    expect(chart.labels).toHaveLength(12);
    expect(chart.labels[0]).toBe('Jan');

    const [teachers, infra, revenue] = chart.datasets;
    expect(teachers).toMatchObject({ label: 'Professoras', stack: 'despesas' });
    expect(infra).toMatchObject({ label: 'Infraestrutura', stack: 'despesas' });
    expect(teachers.colorToken).not.toBe(infra.colorToken);
    expect(revenue).toMatchObject({ label: 'Receita', kind: 'line' });
    expect(revenue.data[0]).toBe(190);
  });
});

describe('RevenueGoalService', () => {
  function goalService(seed?: Partial<RevenueGoal>) {
    let stored = new RevenueGoal({ year: 2026, ...seed });
    const repository = {
      find: jest.fn(async () => new RevenueGoal({ ...stored })),
      save: jest.fn(async (goal: RevenueGoal) => {
        stored = goal;
        return goal;
      }),
    };
    return { service: new RevenueGoalService(repository as any), repository };
  }

  it('ano sem meta volta zerado em vez de nulo', async () => {
    const { service } = goalService();
    await expect(service.getGoals(2026)).resolves.toMatchObject({
      annualTarget: 0,
    });
  });

  it('grava a meta anual com quem a definiu', async () => {
    const { service } = goalService();

    const saved = await service.setAnnualGoal(2026, 90000, 'gerente-1');

    expect(saved.annualTarget).toBe(90000);
    expect(saved.updatedBy).toBe('gerente-1');
    expect(saved.updatedAt).toBeTruthy();
  });

  it('meta mensal convive com a anual sem apagá-la', async () => {
    const { service } = goalService({ annualTarget: 90000 });

    const saved = await service.setMonthlyGoal(2026, '2026-08', 8000, 'g');

    expect(saved.annualTarget).toBe(90000);
    expect(saved.monthlyTargets).toEqual({ '08': 8000 });
  });

  it('aceita o mês nas duas formas que a rota pode receber', async () => {
    const { service } = goalService();

    await expect(
      service.setMonthlyGoal(2026, '03', 5000, 'g'),
    ).resolves.toMatchObject({ monthlyTargets: { '03': 5000 } });
  });

  it('recusa mês inválido e meta negativa', async () => {
    const { service } = goalService();

    await expect(service.setMonthlyGoal(2026, '13', 1, 'g')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.setAnnualGoal(2026, -5, 'g')).rejects.toThrow(
      BadRequestException,
    );
  });
});
