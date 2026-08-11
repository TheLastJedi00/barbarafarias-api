import {
  Body,
  Controller,
  Headers,
  Logger,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import {
  MercadoPagoGateway,
  type MercadoPagoNotification,
} from './mercadopago.gateway';
import { Public } from '../decorators/public.decorator';

/**
 * Retorno do Mercado Pago (spec 023).
 *
 * **A URL é configurada no painel, não por requisição** — diferente do
 * `notification_url` da API de Pagamentos. Em *Suas integrações > Webhooks >
 * Configurar notificações*, com abas separadas de produção e teste; salvar é o
 * que gera o segredo da aplicação. O painel tem um botão **Simular** que
 * dispara uma notificação real contra a URL, e ele existe antes de haver
 * qualquer cobrança: é o caminho de teste.
 *
 * Rota pública por definição: o Mercado Pago não carrega o nosso JWT. Quem
 * autentica é a assinatura em `x-signature`.
 *
 * **O corpo não decide nada.** Ele traz o id do recurso e um `type`; o estado
 * vem de uma consulta feita agora (`resolveNotification`). Confiar no corpo
 * seria aceitar como verdade o que quem chamou disse que era.
 */
@Controller('mercadopago/webhook')
export class MercadoPagoWebhookController {
  private readonly logger = new Logger(MercadoPagoWebhookController.name);

  constructor(
    private readonly service: SubscriptionService,
    private readonly mercadoPago: MercadoPagoGateway,
  ) {}

  /**
   * Verifica, busca o recurso, aplica a regra e responde.
   *
   * **401 em assinatura inválida**, e não 400: é o que a doc do Mercado Pago
   * manda, e todos os exemplos dela usam. Outros provedores pedem 400 no
   * mesmo caso — *"é o que ele espera para parar de reenviar"*. Não há um
   * código "certo" universal: **cada provedor decide o que fazer com ele**, e
   * uniformizar faria um reenviar para sempre, ou parar cedo demais. Se um dia
   * houver dois webhooks aqui com códigos diferentes, isso não é inconsistência.
   *
   * Já uma falha no **processamento** propaga (500) de propósito: aí sim
   * queremos a retentativa, porque o dinheiro entrou e o plano não ativou.
   *
   * A resposta precisa sair em até **22 segundos** (`X-Socket-Timeout: 22000`
   * no exemplo oficial) — daí o caminho ser curto: uma consulta e a regra.
   */
  @Post()
  @Public()
  async handle(
    @Body() notification: MercadoPagoNotification,
    @Headers('x-signature') xSignature: string,
    @Headers('x-request-id') xRequestId: string,
    // O `data.id` que entra no manifesto é o do **query param**, não o do
    // corpo. Eles coincidem no caso normal; a doc especifica a URL, e é a URL
    // que assinamos.
    @Query('data.id') dataId: string,
  ): Promise<{ received: boolean }> {
    try {
      this.mercadoPago.verifyNotification({ xSignature, xRequestId, dataId });
    } catch (error) {
      // Vale tanto para assinatura adulterada quanto para segredo ausente: as
      // duas terminam em recusa, nunca em "aceita sem conferir".
      this.logger.warn(`Webhook do Mercado Pago recusado: ${String(error)}`);
      throw new UnauthorizedException('Assinatura do webhook inválida');
    }

    const event = await this.mercadoPago.resolveNotification({
      ...notification,
      // O corpo pode chegar sem `data.id` no reenvio; a URL sempre o tem.
      data: { id: notification.data?.id ?? dataId },
    });
    if (!event) return { received: true };

    await this.service.handleMercadoPagoEvent(event);
    return { received: true };
  }
}
