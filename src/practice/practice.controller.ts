import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
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
/**
 * A conexão de andamento fecha antes do teto da função na Vercel (300 s) e
 * bem antes de qualquer proxy cortar: o front reabre e continua da contagem
 * gravada no baralho.
 */
const PROGRESS_STREAM_MS = 55_000;

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

  /**
   * Andamento do baralho do aluno em `text/event-stream` (fix 037). Fecha
   * quando o baralho fica pronto, dá erro ou some, em 55 s, ou quando o
   * cliente sai — e sempre solta o listener do Firestore.
   */
  @Get('deck/progress')
  deckProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let closed = false;
    const listener: { stop?: () => void } = {};
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      listener.stop?.();
      res.end();
    };
    const timer = setTimeout(close, PROGRESS_STREAM_MS);
    req.on('close', close);

    listener.stop = this.service.watchDeckProgress(
      user.sub,
      (event) => {
        if (closed) return;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.status !== 'generating') close();
      },
      close,
    );
    if (closed) listener.stop();
  }
}
