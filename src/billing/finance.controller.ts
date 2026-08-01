import { Controller, ForbiddenException, Get, Param } from '@nestjs/common';
import { TeacherEarningsService } from './teacher-earnings.service';
import type { TeacherEarnings } from './teacher-earnings.service';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';

/**
 * Faturamento sob a ótica da professora (spec 011 RF12.1). Vive separado de
 * `/billing`, que é o painel de fechamento da gerente e carrega PIX, CPF e a
 * folha inteira — dados que nenhuma professora pode ver.
 */
@Controller('finance')
export class FinanceController {
  constructor(private readonly earnings: TeacherEarningsService) {}

  /** Projeção da professora logada. Rota fixa antes da paramétrica. */
  @Get('teacher/me')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  me(@CurrentUser() user: AuthenticatedUser): Promise<TeacherEarnings> {
    return this.earnings.forTeacher(user.sub);
  }

  /** A gerente pode inspecionar a projeção de qualquer professora. */
  @Get('teacher/:teacherId')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  byTeacher(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teacherId') teacherId: string,
  ): Promise<TeacherEarnings> {
    if (user.role !== ROLES.MANAGER && user.sub !== teacherId) {
      throw new ForbiddenException('Sem acesso ao faturamento de outra professora');
    }
    return this.earnings.forTeacher(teacherId);
  }
}
