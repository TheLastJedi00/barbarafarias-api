import { IsNumber, IsOptional, Matches, Min } from 'class-validator';
import { InfraExpense, InfraMonthAmount } from '../infra-expense.entity';

export class SetAnnualGoalDto {
  @IsNumber()
  @Min(1900)
  year!: number;

  @IsNumber()
  @Min(0)
  annualTarget!: number;
}

export class SetMonthlyGoalDto {
  @IsNumber()
  @Min(1900)
  year!: number;

  @IsNumber()
  @Min(0)
  target!: number;
}

export class SetInfraExpenseDto {
  @IsNumber()
  @Min(0)
  monthlyAmount!: number;

  /** Mês a partir do qual o valor vale. Omitido = mês corrente. */
  @Matches(/^\d{4}-\d{2}$/, { message: 'Vigência deve estar em YYYY-MM' })
  @IsOptional()
  effectiveFrom?: string;
}

/**
 * O que a tela de infraestrutura precisa numa tacada: quanto vale hoje, como
 * ficou cada mês do ano consultado e o histórico de reajustes (RF9/RF10).
 */
export class InfraExpenseHistoryDto {
  current!: number;
  breakdown!: InfraMonthAmount[];
  history!: InfraExpense[];
}
