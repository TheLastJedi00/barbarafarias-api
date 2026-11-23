import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';
import { AnswerDto } from './dto/answer.dto';
import { PracticeService } from './practice.service';

/**
 * Praticando em Casa (spec 037). Sem `@RequiresActivePlan`: o comprador da
 * loja também pratica, e o plano dele nunca está "ativo". Quem decide o acesso
 * é o serviço — plano em dia ou módulo vigente.
 */
@Controller('practice')
@Roles(ROLES.STUDENT)
export class PracticeController {
  constructor(private readonly service: PracticeService) {}

  /** O ícone do header: barato, sem montar a missão. */
  @Get('today/status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.service.status(user.sub);
  }

  /** 202 com `{ generating, generated, total }` enquanto o baralho do aluno é gerado. */
  @Get('today')
  async today(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.today(user.sub);
    if ('generating' in result) res.status(202);
    return result;
  }

  @Post('today/answers')
  answer(@CurrentUser() user: AuthenticatedUser, @Body() dto: AnswerDto) {
    return this.service.answer(user.sub, dto.cardKey, dto.correct);
  }
}
