import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsBoolean, IsOptional, Matches } from 'class-validator';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { assertCronSecret } from '../common/cron-secret';
import { TurmaLifecycleService } from './turma-lifecycle.service';

export class ConfirmTurmaDto {
  /** Confirma abaixo do mínimo: a gerente diz que viu. */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class PostponeTurmaDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data de início inválida' })
  startDate!: string;
}

/**
 * Ciclo da turma em formação (spec 036): confirmar, adiar, cancelar e ver as
 * matrículas. Só a gerente. Fica sob `turmas/forming`, ao lado da criação,
 * mas é provido pelo `SubscriptionModule` — confirmar cria assinaturas.
 */
@Controller('turmas/forming')
export class TurmaLifecycleController {
  constructor(private readonly lifecycle: TurmaLifecycleService) {}

  /** Lista da Gestão › Turmas, com pagos e pendentes por turma. */
  @Get('overview')
  @Roles(ROLES.MANAGER)
  overview() {
    return this.lifecycle.overview();
  }

  @Get(':id/enrollments')
  @Roles(ROLES.MANAGER)
  enrollments(@Param('id') id: string) {
    return this.lifecycle.enrollmentsOf(id);
  }

  @Post(':id/confirm')
  @Roles(ROLES.MANAGER)
  confirm(@Param('id') id: string, @Body() dto: ConfirmTurmaDto) {
    return this.lifecycle.confirm(id, { force: dto.force });
  }

  @Post(':id/postpone')
  @Roles(ROLES.MANAGER)
  postpone(
    @Param('id') id: string,
    @Body() dto: PostponeTurmaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lifecycle.postpone(id, dto.startDate, user);
  }

  @Post(':id/cancel')
  @Roles(ROLES.MANAGER)
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.cancel(id, user);
  }
}

/**
 * Cron diário das 08:00 de Brasília (`vercel.json`, `0 11 * * *`): lembra a
 * gerente das turmas que começam em até 7 dias sem decisão (spec 036 §7).
 */
@Controller('internal/cron')
export class TurmaRemindersCronController {
  constructor(
    private readonly lifecycle: TurmaLifecycleService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('turmas')
  async run(@Headers('authorization') authorization: string | undefined) {
    assertCronSecret(this.config, authorization);
    return { reminded: await this.lifecycle.sendStartReminders() };
  }
}
