import { BadRequestException, Injectable } from '@nestjs/common';
import { InfraExpenseRepository } from './infra-expense.repository';
import {
  InfraExpense,
  InfraMonthAmount,
  monthsOfYear,
  resolveAmountForMonth,
} from './infra-expense.entity';
import { todayInAppTimezone } from '../common/time';

@Injectable()
export class InfraExpenseService {
  constructor(private readonly repository: InfraExpenseRepository) {}

  /**
   * Registra um novo valor de infraestrutura a partir de um mês (RF9). Nunca
   * edita o anterior: é o snapshot antigo que mantém intacta a rentabilidade
   * dos meses já fechados (RF10).
   */
  async setExpense(
    monthlyAmount: number,
    effectiveFrom: string,
    userId: string,
  ): Promise<InfraExpense> {
    if (monthlyAmount < 0) {
      throw new BadRequestException('O valor não pode ser negativo');
    }
    if (!/^\d{4}-\d{2}$/.test(effectiveFrom)) {
      throw new BadRequestException('Mês de vigência deve estar em YYYY-MM');
    }

    return this.repository.save(
      new InfraExpense({
        monthlyAmount: round2(monthlyAmount),
        effectiveFrom,
        createdAt: new Date().toISOString(),
        createdBy: userId,
      }),
    );
  }

  /** Valor que vale hoje. Zero enquanto a gerente não registrar nenhum. */
  getCurrentExpense(): Promise<number> {
    return this.getForMonth(currentMonth());
  }

  /** Valor que vigorava no mês 'YYYY-MM'. */
  async getForMonth(month: string): Promise<number> {
    const snapshot = await this.repository.findForMonth(month);
    return snapshot?.monthlyAmount ?? 0;
  }

  /**
   * Os doze meses do ano com o valor correto de cada um. Um reajuste no meio
   * do ano aparece aqui como degrau — os meses antes dele mantêm o valor
   * antigo, que é justamente o ponto do modelo de snapshots.
   */
  async getAnnualBreakdown(year: number): Promise<InfraMonthAmount[]> {
    const snapshots = await this.repository.findForYear(year);
    return monthsOfYear(year).map((month) => ({
      month,
      amount: resolveAmountForMonth(snapshots, month),
    }));
  }

  /** Histórico completo de alterações, para a gerente auditar (RF10). */
  getHistory(): Promise<InfraExpense[]> {
    return this.repository.findAll();
  }
}

function currentMonth(): string {
  return todayInAppTimezone().slice(0, 7);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
