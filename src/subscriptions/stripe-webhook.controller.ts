import {
  BadRequestException,
  Controller,
  Headers,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { SubscriptionService } from './subscription.service';
import { StripeGateway } from './stripe.gateway';
import { Public } from '../decorators/public.decorator';

/** O corpo cru que o `verify` do body-parser guardou (ver `main.ts`). */
type RawRequest = Request & { rawBody?: Buffer };

/**
 * Retorno do Stripe (spec 014). São **dois** endpoints porque o painel oferece
 * dois estilos de payload, e o `context.md` fixou as duas URLs:
 *
 * - `conteudo-instantaneo` (snapshot): o evento inteiro vem no corpo;
 * - `conteudo-minimo` (thin): vêm só id e tipo, e o objeto é buscado na API.
 *
 * Cada um verifica com a **sua** chave de assinatura — são endpoints distintos
 * no Stripe, com segredos distintos —, mas os dois chamam o mesmo
 * `handleStripeEvent`. Separar a regra por endpoint faria o pagamento depender
 * de qual estilo está configurado no painel, e uma troca de configuração
 * pararia de ativar planos em silêncio.
 *
 * Rotas públicas por definição: o Stripe não carrega o nosso JWT. Quem
 * autentica é a assinatura sobre o corpo cru.
 */
@Controller('stripe/webhook')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly service: SubscriptionService,
    private readonly stripe: StripeGateway,
  ) {}

  @Post('conteudo-instantaneo')
  @Public()
  snapshot(
    @Req() request: RawRequest,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    return this.handle(request, signature, (raw, sig) =>
      this.stripe.verifySnapshotEvent(raw, sig),
    );
  }

  @Post('conteudo-minimo')
  @Public()
  thin(
    @Req() request: RawRequest,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    return this.handle(request, signature, (raw, sig) =>
      this.stripe.verifyThinEvent(raw, sig),
    );
  }

  /**
   * Verifica, processa e responde.
   *
   * Assinatura inválida devolve **400**, e não 401: é o que o Stripe espera
   * para parar de reenviar um payload que nunca vai ser aceito. Já uma falha
   * no processamento **propaga** (500) de propósito — aí sim queremos a
   * retentativa do Stripe, porque a cobrança foi paga de verdade e o plano
   * ainda não foi ativado.
   */
  private async handle(
    request: RawRequest,
    signature: string,
    verify: (raw: Buffer, signature: string) => Promise<any>,
  ): Promise<{ received: boolean }> {
    const raw = request.rawBody;
    if (!raw || !signature) {
      throw new BadRequestException('Webhook sem corpo cru ou assinatura');
    }

    let event: Awaited<ReturnType<typeof verify>>;
    try {
      event = await verify(raw, signature);
    } catch (error) {
      this.logger.warn(`Webhook do Stripe recusado: ${String(error)}`);
      throw new BadRequestException('Assinatura do webhook inválida');
    }

    await this.service.handleStripeEvent(event);
    return { received: true };
  }
}
