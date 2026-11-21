import { ManagerFinanceService } from './manager-finance.service';
import { RevenueGoal } from './revenue-goal.entity';
import { netOfGatewayFee } from '../subscriptions/subscription.entity';
import type { Enrollment } from '../enrollments/enrollment.model';

/**
 * Sinais das turmas no Financeiro (spec 036 §5, T24): o sinal é receita **no
 * mês do início da turma**, junto com o plano. Antes disso aparece à parte,
 * como "sinais de turmas em formação", fora do faturamento.
 */
const matricula = (extra: Partial<Enrollment>): Enrollment =>
  ({
    id: 'm',
    studentId: 'a',
    studentName: 'A',
    turmaId: 't1',
    tierId: 'weekly-group',
    mode: 'PACKAGE',
    paymentMethod: 'PIX_RECURRING',
    feeAmount: 150,
    status: 'PAID',
    gateway: {},
    termsVersion: 'v',
    createdAt: '',
    updatedAt: '',
    paidAt: '2026-11-20T15:00:00.000Z',
    ...extra,
  }) as Enrollment;

function build(enrollments: Enrollment[]) {
  return new ManagerFinanceService(
    { summary: jest.fn().mockResolvedValue([]) } as any,
    { findByStatus: jest.fn().mockResolvedValue([]) } as any,
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
      findByMonth: jest.fn().mockResolvedValue([]),
      findByYear: jest.fn().mockResolvedValue([]),
    } as any,
    { findAll: jest.fn().mockResolvedValue([]) } as any,
    { findAll: jest.fn().mockResolvedValue(enrollments) } as any,
  );
}

describe('ManagerFinanceService — sinais das turmas (spec 036)', () => {
  const lista = [
    // pago em novembro, turma ainda em formação
    matricula({ id: 'm1' }),
    // convertido, turma começa em dezembro
    matricula({
      id: 'm2',
      status: 'CONVERTED',
      startDate: '2026-12-01',
      feeAmount: 200,
    }),
    // devolvido: não entra em lugar nenhum
    matricula({ id: 'm3', status: 'REFUNDED' }),
  ];

  it('em formação: aparece à parte no mês do pagamento, fora da receita', async () => {
    const nov = await build(lista).getMonthlyOverview('2026-11');
    expect(nov.revenue).toBe(0);
    expect(nov.enrollmentDeposits).toBe(netOfGatewayFee(150));
  });

  it('convertido: entra na receita do mês do início da turma', async () => {
    const dez = await build(lista).getMonthlyOverview('2026-12');
    expect(dez.revenue).toBe(netOfGatewayFee(200));
    expect(dez.enrollmentRevenue).toBe(netOfGatewayFee(200));
    expect(dez.enrollmentDeposits).toBe(0);
  });

  it('o ano soma o sinal no mês do início', async () => {
    const ano = await build(lista).getAnnualOverview(2026);
    expect(ano.months.find((m) => m.month === '2026-12')!.revenue).toBe(
      netOfGatewayFee(200),
    );
    expect(ano.months.find((m) => m.month === '2026-11')!.revenue).toBe(0);
  });
});
