import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ManagerFinanceService, currentMonth } from './manager-finance.service';
import { InfraExpenseService } from './infra-expense.service';
import { RevenueGoalService } from './revenue-goal.service';
import { SubscriptionService } from '../subscriptions/subscription.service';
import {
  InfraExpenseHistoryDto,
  SetAnnualGoalDto,
  SetInfraExpenseDto,
  SetMonthlyGoalDto,
} from './dto/manager-finance.dto';
import {
  CreateCouponDto,
  ToggleCouponDto,
} from '../subscriptions/dto/subscription.dto';
import { Coupon } from '../subscriptions/coupon.entity';
import { InfraExpense } from './infra-expense.entity';
import { RevenueGoal } from './revenue-goal.entity';
import {
  AnnualOverview,
  ChartData,
  MonthlyOverview,
} from './manager-finance.entity';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import { todayInAppTimezone } from '../common/time';

/**
 * Painel financeiro estratégico (spec 012 RF6–RF12, RF15).
 *
 * Vive sob `/finance/manager` e é **inteiro** da gerente: o `@Roles` no
 * controller vale para todas as rotas. `/finance/teacher/*`, que a professora
 * enxerga, continua no `BillingModule` — separar por prefixo evita que uma
 * rota nova aqui herde por engano a audiência de lá.
 */
@Controller('finance/manager')
@Roles(ROLES.MANAGER)
export class ManagerFinanceController {
  constructor(
    private readonly finance: ManagerFinanceService,
    private readonly infra: InfraExpenseService,
    private readonly goals: RevenueGoalService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  @Get('overview')
  overview(@Query('month') month?: string): Promise<MonthlyOverview> {
    return this.finance.getMonthlyOverview(month || currentMonth());
  }

  @Get('annual')
  annual(@Query('year') year?: string): Promise<AnnualOverview> {
    return this.finance.getAnnualOverview(this.resolveYear(year));
  }

  @Get('chart')
  chart(@Query('year') year?: string): Promise<ChartData> {
    return this.finance.getChartData(this.resolveYear(year));
  }

  // ----------------------------------------------------------------- metas

  @Get('goals')
  getGoals(@Query('year') year?: string): Promise<RevenueGoal> {
    return this.goals.getGoals(this.resolveYear(year));
  }

  @Put('goals')
  setAnnualGoal(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetAnnualGoalDto,
  ): Promise<RevenueGoal> {
    return this.goals.setAnnualGoal(dto.year, dto.annualTarget, user.sub);
  }

  @Put('goals/:month')
  setMonthlyGoal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('month') month: string,
    @Body() dto: SetMonthlyGoalDto,
  ): Promise<RevenueGoal> {
    return this.goals.setMonthlyGoal(dto.year, month, dto.target, user.sub);
  }

  // -------------------------------------------------------- infraestrutura

  @Post('infra')
  setInfraExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetInfraExpenseDto,
  ): Promise<InfraExpense> {
    return this.infra.setExpense(
      dto.monthlyAmount,
      dto.effectiveFrom || currentMonth(),
      user.sub,
    );
  }

  @Get('infra')
  async infraHistory(
    @Query('year') year?: string,
  ): Promise<InfraExpenseHistoryDto> {
    const resolved = this.resolveYear(year);
    const [current, breakdown, history] = await Promise.all([
      this.infra.getCurrentExpense(),
      this.infra.getAnnualBreakdown(resolved),
      this.infra.getHistory(),
    ]);
    return { current, breakdown, history };
  }

  // --------------------------------------------------------------- cupons

  @Get('coupons')
  listCoupons(): Promise<Coupon[]> {
    return this.subscriptions.listCoupons();
  }

  @Post('coupons')
  createCoupon(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCouponDto,
  ): Promise<Coupon> {
    return this.subscriptions.createCoupon(dto, user.sub);
  }

  @Patch('coupons/:id')
  toggleCoupon(
    @Param('id') id: string,
    @Body() dto: ToggleCouponDto,
  ): Promise<Coupon> {
    return this.subscriptions.toggleCoupon(id, dto.active);
  }

  /**
   * Ano da query, caindo no corrente quando ausente ou inválido. Um
   * `ParseIntPipe` não serve aqui: ele rejeitaria a chamada sem `?year=`, que
   * é o caso normal ao abrir a tela.
   */
  private resolveYear(year?: string): number {
    const parsed = Number(year);
    return Number.isInteger(parsed) && parsed > 1900
      ? parsed
      : Number(todayInAppTimezone().slice(0, 4));
  }
}
