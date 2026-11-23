import { Body, Controller, Get, Post } from '@nestjs/common';
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

  @Get('today')
  today(@CurrentUser() user: AuthenticatedUser) {
    return this.service.today(user.sub);
  }

  @Post('today/answers')
  answer(@CurrentUser() user: AuthenticatedUser, @Body() dto: AnswerDto) {
    return this.service.answer(user.sub, dto.cardKey, dto.correct);
  }
}
