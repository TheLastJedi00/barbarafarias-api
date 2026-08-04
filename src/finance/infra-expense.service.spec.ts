import { BadRequestException } from '@nestjs/common';
import { InfraExpenseService } from './infra-expense.service';
import { InfraExpense, monthsOfYear } from './infra-expense.entity';

/** Repositório em memória com a mesma semântica temporal do Firestore. */
function fakeRepository(seed: Partial<InfraExpense>[] = []) {
  const rows: InfraExpense[] = seed.map(
    (item, index) =>
      new InfraExpense({
        id: `snap-${index}`,
        createdAt: '2026-01-01T00:00:00.000Z',
        createdBy: 'gerente',
        ...item,
      }),
  );

  const sorted = () =>
    [...rows].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  return {
    rows,
    findAll: jest.fn(async () => sorted()),
    findForMonth: jest.fn(async (month: string) => {
      const applicable = sorted().filter(
        (item) => item.effectiveFrom <= month,
      );
      return applicable.length === 0
        ? null
        : applicable[applicable.length - 1];
    }),
    findForYear: jest.fn(async (year: number) => {
      const all = sorted();
      const january = `${year}-01`;
      const december = `${year}-12`;
      const previous = all.filter((item) => item.effectiveFrom < january);
      const within = all.filter(
        (item) =>
          item.effectiveFrom >= january && item.effectiveFrom <= december,
      );
      return previous.length === 0
        ? within
        : [previous[previous.length - 1], ...within];
    }),
    save: jest.fn(async (expense: InfraExpense) => {
      const created = new InfraExpense({ ...expense, id: `snap-${rows.length}` });
      rows.push(created);
      return created;
    }),
  };
}

describe('InfraExpenseService — gravação de snapshots', () => {
  it('cada alteração vira um registro novo, sem apagar o anterior', async () => {
    const repository = fakeRepository([
      { monthlyAmount: 300, effectiveFrom: '2026-01' },
    ]);
    const service = new InfraExpenseService(repository as any);

    await service.setExpense(450, '2026-07', 'gerente');

    expect(repository.rows).toHaveLength(2);
    expect(repository.rows.map((row) => row.monthlyAmount)).toEqual([300, 450]);
  });

  it('recusa valor negativo e mês fora do formato', async () => {
    const service = new InfraExpenseService(fakeRepository() as any);

    await expect(service.setExpense(-1, '2026-07', 'g')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.setExpense(100, '07/2026', 'g')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('InfraExpenseService — resolução temporal', () => {
  const service = () =>
    new InfraExpenseService(
      fakeRepository([
        { monthlyAmount: 300, effectiveFrom: '2026-01' },
        { monthlyAmount: 450, effectiveFrom: '2026-07' },
      ]) as any,
    );

  it('mês sem snapshot próprio herda o anterior', async () => {
    await expect(service().getForMonth('2026-05')).resolves.toBe(300);
    await expect(service().getForMonth('2026-09')).resolves.toBe(450);
  });

  it('o mês do reajuste já usa o valor novo', async () => {
    await expect(service().getForMonth('2026-07')).resolves.toBe(450);
    await expect(service().getForMonth('2026-06')).resolves.toBe(300);
  });

  it('mês anterior a qualquer snapshot custa zero', async () => {
    await expect(service().getForMonth('2025-12')).resolves.toBe(0);
  });

  it('sem nenhum snapshot registrado, tudo é zero', async () => {
    const empty = new InfraExpenseService(fakeRepository() as any);
    await expect(empty.getForMonth('2026-03')).resolves.toBe(0);
    await expect(empty.getCurrentExpense()).resolves.toBe(0);
  });
});

describe('InfraExpenseService — breakdown anual', () => {
  it('mudança no meio do ano vira degrau, sem recalcular os meses passados', async () => {
    const service = new InfraExpenseService(
      fakeRepository([
        { monthlyAmount: 300, effectiveFrom: '2026-01' },
        { monthlyAmount: 450, effectiveFrom: '2026-07' },
      ]) as any,
    );

    const breakdown = await service.getAnnualBreakdown(2026);

    expect(breakdown).toHaveLength(12);
    expect(breakdown.map((item) => item.amount)).toEqual([
      300, 300, 300, 300, 300, 300, 450, 450, 450, 450, 450, 450,
    ]);
    expect(breakdown.map((item) => item.month)).toEqual(monthsOfYear(2026));
  });

  it('ano inteiro herda o valor definido antes de janeiro', async () => {
    const service = new InfraExpenseService(
      fakeRepository([
        { monthlyAmount: 250, effectiveFrom: '2025-09' },
      ]) as any,
    );

    const breakdown = await service.getAnnualBreakdown(2026);

    expect(breakdown.every((item) => item.amount === 250)).toBe(true);
  });

  it('meses anteriores ao primeiro snapshot ficam zerados dentro do ano', async () => {
    const service = new InfraExpenseService(
      fakeRepository([
        { monthlyAmount: 500, effectiveFrom: '2026-04' },
      ]) as any,
    );

    const breakdown = await service.getAnnualBreakdown(2026);

    expect(breakdown.slice(0, 3).map((item) => item.amount)).toEqual([0, 0, 0]);
    expect(breakdown[3].amount).toBe(500);
  });
});
