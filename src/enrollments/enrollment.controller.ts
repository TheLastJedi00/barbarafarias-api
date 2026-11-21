import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { EnrollmentService } from './enrollment.service';
import {
  CreateEnrollmentDto,
  EnrollmentCardDto,
  EnrollmentTermsQueryDto,
} from './dto/enrollment.dto';

/**
 * Matrícula do aluno numa turma em formação (spec 036). Sem
 * `@RequiresActivePlan`: quem se matricula ainda não tem plano — é justamente
 * o que está comprando.
 */
@Controller('enrollments')
export class EnrollmentController {
  constructor(private readonly enrollments: EnrollmentService) {}

  /** O termo da matrícula, para ler antes de pagar o sinal. */
  @Get('terms')
  @Roles(ROLES.STUDENT)
  terms(@Query() query: EnrollmentTermsQueryDto) {
    return this.enrollments.terms(query.turmaId, query.mode);
  }

  @Post()
  @Roles(ROLES.STUDENT)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEnrollmentDto,
  ) {
    return this.enrollments.create(user, dto);
  }

  @Get('me')
  @Roles(ROLES.STUDENT)
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.enrollments.mine(user);
  }

  @Post('me/card')
  @Roles(ROLES.STUDENT)
  payWithCard(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EnrollmentCardDto,
  ) {
    return this.enrollments.payWithCard(user, dto);
  }

  @Post('me/card/refresh')
  @Roles(ROLES.STUDENT)
  refreshCard(@CurrentUser() user: AuthenticatedUser) {
    return this.enrollments.refreshCard(user);
  }

  @Post('me/withdraw')
  @Roles(ROLES.STUDENT)
  withdraw(@CurrentUser() user: AuthenticatedUser) {
    return this.enrollments.withdraw(user);
  }

  /** Só com `DEV_MODE=true`: simula o PIX do sinal. */
  @Post('dev/mock-pay')
  @Roles(ROLES.STUDENT)
  mockPay(@CurrentUser() user: AuthenticatedUser) {
    return this.enrollments.mockPay(user);
  }
}
