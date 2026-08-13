import { UnauthorizedException } from '@nestjs/common';
import { MercadoPagoWebhookController } from './mercadopago-webhook.controller';

/**
 * O webhook é a única porta entre um POST anônimo e uma assinatura ativa.
 *
 * Por isso as assertivas aqui são quase todas sobre o que **não** acontece:
 * nada gravado, nada confirmado, nada processado. Um webhook que aceita demais
 * não dá erro — dá acesso.
 */
function build() {
  const service = {
    handleMercadoPagoEvent: jest.fn().mockResolvedValue(undefined),
  };
  const gateway = {
    verifyNotification: jest.fn(),
    resolveNotification: jest.fn().mockResolvedValue({
      topic: 'order',
      id: 'ORD01ABC',
      order: { status: 'processed', status_detail: 'accredited' },
    }),
  };
  return {
    service,
    gateway,
    controller: new MercadoPagoWebhookController(
      service as any,
      gateway as any,
    ),
  };
}

const NOTIFICACAO = {
  action: 'order.updated',
  type: 'order',
  data: { id: 'ORD01ABC' },
};

describe('MercadoPagoWebhookController', () => {
  it('confere a assinatura antes de qualquer coisa', async () => {
    const { controller, gateway } = build();

    await controller.handle(NOTIFICACAO, 'ts=1,v1=abc', 'req-1', 'ORD01ABC');

    expect(gateway.verifyNotification).toHaveBeenCalledWith({
      xSignature: 'ts=1,v1=abc',
      xRequestId: 'req-1',
      // O `data.id` do **query param**, não o do corpo: é a URL que assinamos.
      dataId: 'ORD01ABC',
    });
  });

  it('assinatura inválida devolve 401 e NADA é processado', async () => {
    const { controller, gateway, service } = build();
    gateway.verifyNotification.mockImplementation(() => {
      throw new Error('InvalidWebhookSignatureError');
    });

    await expect(
      controller.handle(NOTIFICACAO, 'ts=1,v1=falsa', 'req-1', 'ORD01ABC'),
    ).rejects.toThrow(UnauthorizedException);

    // O ponto do teste não é o código de resposta: é que a recusa acontece
    // **antes** de buscar o recurso e de tocar o domínio.
    expect(gateway.resolveNotification).not.toHaveBeenCalled();
    expect(service.handleMercadoPagoEvent).not.toHaveBeenCalled();
  });

  it('401 e não 400, seguindo a doc do provedor', async () => {
    const { controller, gateway } = build();
    gateway.verifyNotification.mockImplementation(() => {
      throw new Error('recusada');
    });

    // Não é cosmético: o código de resposta decide se o gateway reenvia para
    // sempre. Uniformizar com o 400 de outro provedor quebraria um dos dois.
    await expect(
      controller.handle(NOTIFICACAO, 'x', 'y', 'z'),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('busca o recurso e aplica a regra sobre ele, não sobre o corpo', async () => {
    const { controller, service, gateway } = build();

    const resposta = await controller.handle(
      // Corpo mentindo que está pago: quem manda é o recurso buscado.
      { ...NOTIFICACAO, action: 'order.paid' },
      'ts=1,v1=abc',
      'req-1',
      'ORD01ABC',
    );

    expect(gateway.resolveNotification).toHaveBeenCalled();
    expect(service.handleMercadoPagoEvent).toHaveBeenCalledWith({
      topic: 'order',
      id: 'ORD01ABC',
      order: { status: 'processed', status_detail: 'accredited' },
    });
    expect(resposta).toEqual({ received: true });
  });

  it('cai no id da URL quando o corpo vem sem ele', async () => {
    const { controller, gateway } = build();

    await controller.handle(
      { type: 'order' },
      'ts=1,v1=abc',
      'req-1',
      'ORD01ABC',
    );

    expect(gateway.resolveNotification).toHaveBeenCalledWith(
      expect.objectContaining({ data: { id: 'ORD01ABC' } }),
    );
  });

  it('tópico que não tratamos responde 200 sem processar nada', async () => {
    const { controller, gateway, service } = build();
    // `null` = reconhecido e ignorado. Responder erro faria o provedor
    // reenviar para sempre uma notificação que nunca vamos tratar.
    gateway.resolveNotification.mockResolvedValue(null);

    const resposta = await controller.handle(
      { type: 'topic_chargebacks_wh', data: { id: 'x' } },
      'ts=1,v1=abc',
      'req-1',
      'x',
    );

    expect(resposta).toEqual({ received: true });
    expect(service.handleMercadoPagoEvent).not.toHaveBeenCalled();
  });

  it('falha no processamento propaga, para o provedor reenviar', async () => {
    const { controller, service } = build();
    service.handleMercadoPagoEvent.mockRejectedValue(new Error('firestore'));

    // Aqui o dinheiro entrou e o plano não ativou: engolir o erro com 200
    // perderia a confirmação para sempre.
    await expect(
      controller.handle(NOTIFICACAO, 'ts=1,v1=abc', 'req-1', 'ORD01ABC'),
    ).rejects.toThrow('firestore');
  });
});
