import { BadRequestException, Injectable } from '@nestjs/common';
import { RevenueGoalRepository } from './revenue-goal.repository';
import { RevenueGoal, normalizeMonthKey } from './revenue-goal.entity';

@Injectable()
export class RevenueGoalService {
  constructor(private readonly repository: RevenueGoalRepository) {}

  /** Metas do ano. Ano sem meta volta zerado, não nulo — simplifica a tela. */
  getGoals(year: number): Promise<RevenueGoal> {
    return this.repository.find(year);
  }

  async setAnnualGoal(
    year: number,
    target: number,
    userId: string,
  ): Promise<RevenueGoal> {
    assertNonNegative(target);
    const goal = await this.repository.find(year);
    goal.annualTarget = target;
    goal.updatedAt = new Date().toISOString();
    goal.updatedBy = userId;
    return this.repository.save(goal);
  }

  /**
   * Meta de um mês específico. Não mexe na anual: as duas convivem porque a
   * gerente pode querer um alvo maior em um mês de campanha sem redistribuir
   * o ano inteiro.
   */
  async setMonthlyGoal(
    year: number,
    month: string,
    target: number,
    userId: string,
  ): Promise<RevenueGoal> {
    assertNonNegative(target);
    const key = normalizeMonthKey(month);
    if (!/^(0[1-9]|1[0-2])$/.test(key)) {
      throw new BadRequestException('Mês inválido');
    }

    const goal = await this.repository.find(year);
    goal.monthlyTargets = { ...(goal.monthlyTargets ?? {}), [key]: target };
    goal.updatedAt = new Date().toISOString();
    goal.updatedBy = userId;
    return this.repository.save(goal);
  }
}

function assertNonNegative(target: number): void {
  if (typeof target !== 'number' || Number.isNaN(target) || target < 0) {
    throw new BadRequestException('A meta deve ser um valor não negativo');
  }
}
