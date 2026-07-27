import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { IsNumber, Min } from 'class-validator';
import { BillingService } from './billing.service';
import { BillingSummaryService } from './billing-summary.service';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import { todayInAppTimezone } from '../common/time';

export class UpdateBillingSettingsDto {
  @IsNumber({}, { message: 'Valor-hora deve ser numérico' })
  @Min(0)
  defaultHourlyRate!: number;
}

@Controller('billing')
@Roles(ROLES.MANAGER)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly summaryService: BillingSummaryService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.billingService.getSettings();
  }

  @Put('settings')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateBillingSettingsDto,
  ) {
    return this.billingService.updateSettings(dto.defaultHourlyRate, user.sub);
  }

  @Get('summary')
  summary(@Query('month') month?: string) {
    return this.summaryService.summary(month || this.currentMonth());
  }

  @Get('summary/:teacherId')
  detail(
    @Param('teacherId') teacherId: string,
    @Query('month') month?: string,
  ) {
    return this.summaryService.detail(teacherId, month || this.currentMonth());
  }

  @Post('summary/:teacherId/pay')
  pay(@Param('teacherId') teacherId: string, @Query('month') month?: string) {
    return this.summaryService.pay(teacherId, month || this.currentMonth());
  }

  private currentMonth(): string {
    return todayInAppTimezone().slice(0, 7);
  }
}
