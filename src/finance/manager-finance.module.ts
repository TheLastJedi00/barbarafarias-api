import { Module } from '@nestjs/common';
import { ManagerFinanceController } from './manager-finance.controller';
import { FinanceController } from './finance.controller';
import { TeacherEarningsService } from './teacher-earnings.service';
import { TeacherRepository } from '../teachers/teacher.repository';
import { ManagerFinanceService } from './manager-finance.service';
import { InfraExpenseService } from './infra-expense.service';
import { InfraExpenseRepository } from './infra-expense.repository';
import { RevenueGoalService } from './revenue-goal.service';
import { RevenueGoalRepository } from './revenue-goal.repository';
import { BillingModule } from '../billing/billing.module';
import { SubscriptionModule } from '../subscriptions/subscription.module';

/**
 * Dono do prefixo `/finance` inteiro (spec 012 RF6–RF12, RF15).
 *
 * Não duplica nada: a folha das professoras vem do `BillingModule`, a receita
 * e os cupons vêm do `SubscriptionModule`. O que nasce aqui é só o que não
 * existia — infraestrutura, metas e a consolidação dos três.
 *
 * O `FinanceController` (`/finance/teacher/*`) mudou-se do `BillingModule` para
 * cá no Fix 2: o faturamento da gerente passou a ser o lucro do negócio, que só
 * o `ManagerFinanceService` sabe calcular. Deixá-lo lá exigiria `BillingModule`
 * importar este módulo — que já importa aquele — e resolver o ciclo com
 * `forwardRef`. Com o `/finance` num lugar só, a dependência é direta.
 *
 * `TeacherRepository` é provido aqui pelo mesmo motivo do `BillingModule`:
 * é stateless sobre o Firestore, e importar o `TeacherModule` traria de volta
 * a cadeia que gerou o ciclo.
 */
@Module({
  imports: [BillingModule, SubscriptionModule],
  controllers: [ManagerFinanceController, FinanceController],
  providers: [
    ManagerFinanceService,
    TeacherEarningsService,
    TeacherRepository,
    InfraExpenseService,
    InfraExpenseRepository,
    RevenueGoalService,
    RevenueGoalRepository,
  ],
  exports: [
    ManagerFinanceService,
    TeacherEarningsService,
    InfraExpenseService,
    RevenueGoalService,
  ],
})
export class ManagerFinanceModule {}
