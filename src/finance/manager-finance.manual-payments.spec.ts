import { ManagerFinanceService } from './manager-finance.service';
import { RevenueGoal } from './revenue-goal.entity';
import {
  CHARGE_STATUS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUS,
  Subscription,
  netOfGatewayFee,
} from '../subscriptions/subscription.entity';
import { ManualPayment } from '../manual-payments/manual-payment.entity';

/**
 * Recebido por fora do gateway (spec 026 §9–§10). Regime de caixa: o valor é
 * receita do mês em que a gerente registrou, inteiro, sem taxa de gateway.
 */
function monthly(
  studentId: string,
  month: string,
  amount: number,
): Subscription {
  return new Subscription({
    id: studentId,
    studentId,
    plan: SUBSCRIPTION_PLANS.MONTHLY,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    charges: [
      {
        index: 1,
        dueDate: `${month}-10`,
        amount,
        status: CHARGE_STATUS.PENDING,
      },
    ],
  });
}

function payment(
  id: string,
  month: string,
  amount: number,
  extra: Partial<ManualPayment> = {},
): ManualPayment {
  return new ManualPayment({
    id,
    studentId: `s-${id}`,
    studentName: `Aluno ${id}`,
    amount,
    month,
    grantedAt: `${month}-10T15:00:00.000Z`,
    accessUntil: `${month}-28`,
    grantedBy: 'gerente',
    ...extra,
  });
}

function build(subscriptions: Subscription[], manual: ManualPayment[]) {
  const service = new ManagerFinanceService(
    { summary: jest.fn().mockResolvedValue([]) } as any,
    { findByStatus: jest.fn().mockResolvedValue(subscriptions) } as any,
    {
      getForMonth: jest.fn().mockResolvedValue(0),
      getAnnualBreakdown: jest.fn(async (year: number) =>
        Array.from({ length: 12 }, (_, index) => ({
          month: `${year}-${String(index + 1).padStart(2, '0')}`,
          amount: 0,
        })),
      ),
    } as any,
    {
      getGoals: jest.fn().mockResolvedValue(new RevenueGoal({ year: 2026 })),
    } as any,
    {
      findByMonth: jest.fn(async (month: string) =>
        manual.filter((item) => item.month === month),
      ),
      findByYear: jest.fn(async (year: number) =>
        manual.filter((item) => item.month.startsWith(String(year))),
      ),
    } as any,
  );
  return service;
}

describe('ManagerFinanceService — recebido por fora (spec 026)', () => {
  it('soma no mês em que foi registrado, e só nele', async () => {
    const service = build([], [payment('1', '2026-08', 200)]);

    await expect(service.getMonthlyOverview('2026-08')).resolves.toMatchObject({
      revenue: 200,
      manualRevenue: 200,
    });
    await expect(service.getMonthlyOverview('2026-09')).resolves.toMatchObject({
      revenue: 0,
      manualRevenue: 0,
    });
  });

  it('não desconta taxa de gateway — o dinheiro não passou por um', async () => {
    const service = build(
      [monthly('a1', '2026-08', 240)],
      [payment('1', '2026-08', 199.9)],
    );

    const overview = await service.getMonthlyOverview('2026-08');

    expect(overview.revenue).toBe(
      Math.round((netOfGatewayFee(240) + 199.9) * 100) / 100,
    );
    expect(overview.manualRevenue).toBe(199.9);
  });

  it('cortesia não soma, mas aparece na lista do mês', async () => {
    const service = build(
      [],
      [payment('1', '2026-08', 0), payment('2', '2026-08', 150)],
    );

    const overview = await service.getMonthlyOverview('2026-08');
    const list = await service.getManualPayments('2026-08');

    expect(overview.revenue).toBe(150);
    expect(list.courtesies).toBe(1);
    expect(list.items.map((item) => item.courtesy)).toEqual([true, false]);
  });

  it('estornado sai do total do mês original e segue na lista, marcado', async () => {
    const service = build(
      [],
      [
        payment('1', '2026-08', 200, { voidedAt: '2026-09-02T12:00:00.000Z' }),
        payment('2', '2026-08', 80),
      ],
    );

    const august = await service.getMonthlyOverview('2026-08');
    const september = await service.getMonthlyOverview('2026-09');
    const list = await service.getManualPayments('2026-08');

    expect(august.revenue).toBe(80);
    // O estorno não vira lançamento negativo no mês da revogação.
    expect(september.revenue).toBe(0);
    expect(list.total).toBe(80);
    expect(list.items.find((item) => item.id === '1')).toMatchObject({
      voided: true,
    });
  });

  it('entra no anual mês a mês', async () => {
    const service = build(
      [],
      [payment('1', '2026-03', 100), payment('2', '2026-11', 50)],
    );

    const annual = await service.getAnnualOverview(2026);

    expect(annual.months[2].revenue).toBe(100);
    expect(annual.months[10].revenue).toBe(50);
    expect(annual.totalRevenue).toBe(150);
  });

  it('pagante por fora conta como aluno ativo; cortesia e estornado não', async () => {
    const service = build(
      [monthly('a1', '2026-08', 240)],
      [
        payment('1', '2026-08', 200),
        payment('2', '2026-08', 0),
        payment('3', '2026-08', 90, { voidedAt: '2026-08-20T00:00:00.000Z' }),
        // o mesmo aluno da assinatura pagando também por fora: conta uma vez
        payment('4', '2026-08', 50, { studentId: 'a1' }),
      ],
    );

    const overview = await service.getMonthlyOverview('2026-08');

    expect(overview.activeStudents).toBe(2);
  });
});
