import { Module } from '@nestjs/common';
import { ManagerFinanceController } from './manager-finance.controller';
import { ManagerFinanceService } from './manager-finance.service';
import { InfraExpenseService } from './infra-expense.service';
import { InfraExpenseRepository } from './infra-expense.repository';
import { RevenueGoalService } from './revenue-goal.service';
import { RevenueGoalRepository } from './revenue-goal.repository';
import { BillingModule } from '../billing/billing.module';
import { SubscriptionModule } from '../subscriptions/subscription.module';

/**
 * Painel financeiro da gerente (spec 012 RF6–RF12, RF15).
 *
 * Não duplica nada: a folha das professoras vem do `BillingModule`, a receita
 * e os cupons vêm do `SubscriptionModule`. O que nasce aqui é só o que não
 * existia — infraestrutura, metas e a consolidação dos três.
 */
@Module({
  imports: [BillingModule, SubscriptionModule],
  controllers: [ManagerFinanceController],
  providers: [
    ManagerFinanceService,
    InfraExpenseService,
    InfraExpenseRepository,
    RevenueGoalService,
    RevenueGoalRepository,
  ],
  exports: [ManagerFinanceService, InfraExpenseService, RevenueGoalService],
})
export class ManagerFinanceModule {}
