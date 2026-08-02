import { Controller, ForbiddenException, Get, Param } from '@nestjs/common';
import { TeacherEarningsService } from './teacher-earnings.service';
import type { Earnings } from './teacher-earnings.service';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';

/**
 * "Quanto eu ganho", sob a ótica de quem pergunta (spec 011 RF12.1 + spec 012
 * Fix 2). Vive separado de `/billing`, que é o painel de fechamento da gerente
 * e carrega PIX, CPF e a folha inteira — dados que nenhuma professora pode ver.
 *
 * A resposta vem com `kind` (`teacher` | `manager`): para a professora é a
 * projeção das horas dela; para a gerente, o lucro do negócio. Um endpoint só
 * porque a pergunta é a mesma — **qual conta responde é regra de negócio**, e o
 * cliente não deveria precisar sabê-la para escolher a URL.
 */
@Controller('finance')
export class FinanceController {
  constructor(private readonly earnings: TeacherEarningsService) {}

  /** Faturamento de quem está logado. Rota fixa antes da paramétrica. */
  @Get('teacher/me')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  me(@CurrentUser() user: AuthenticatedUser): Promise<Earnings> {
    return this.earnings.forTeacher(user.sub, user.role);
  }

  /** A gerente pode inspecionar a projeção de qualquer professora. */
  @Get('teacher/:teacherId')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  byTeacher(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teacherId') teacherId: string,
  ): Promise<Earnings> {
    if (user.role !== ROLES.MANAGER && user.sub !== teacherId) {
      throw new ForbiddenException('Sem acesso ao faturamento de outra professora');
    }
    // O papel usado é o do **alvo**, não o de quem pede: a gerente consultando
    // uma professora quer ver a projeção de horas dela, não o lucro do negócio.
    // Só quando ela consulta a si mesma é que a conta vira a do negócio.
    const targetRole = teacherId === user.sub ? user.role : undefined;
    return this.earnings.forTeacher(teacherId, targetRole);
  }
}
