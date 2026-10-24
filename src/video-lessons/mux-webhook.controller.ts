import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../decorators/public.decorator';
import { MuxGateway } from './mux.gateway';
import { VideoLessonService } from './video-lesson.service';

/**
 * Retorno do Mux quando o processamento termina (spec 027).
 *
 * Rota pública: o Mux não carrega o nosso token. Quem autentica é a assinatura
 * em `mux-signature`, calculada sobre o **corpo cru** — o `main.ts` já guarda
 * os bytes em `req.rawBody` para isso.
 *
 * Assinatura inválida ou segredo ausente → 401, e o Mux reenvia por até 24 h.
 * Uma falha no processamento propaga (500) pelo mesmo motivo: queremos a
 * retentativa. Enquanto isso, o `sync` do painel cobre a espera.
 */
@Controller('webhooks/mux')
export class MuxWebhookController {
  private readonly logger = new Logger(MuxWebhookController.name);

  constructor(
    private readonly mux: MuxGateway,
    private readonly service: VideoLessonService,
  ) {}

  @Post()
  @Public()
  @HttpCode(200)
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<{ received: boolean }> {
    let state;
    try {
      state = await this.mux.unwrapWebhook(
        req.rawBody ?? JSON.stringify(req.body ?? {}),
        headers,
      );
    } catch (error) {
      this.logger.warn(`Webhook do Mux recusado: ${String(error)}`);
      throw new UnauthorizedException('Assinatura do webhook inválida');
    }

    if (state) await this.service.handleMuxEvent(state);
    return { received: true };
  }
}
