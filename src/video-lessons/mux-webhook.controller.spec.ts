import { UnauthorizedException } from '@nestjs/common';
import { MuxWebhookController } from './mux-webhook.controller';

describe('MuxWebhookController (spec 027)', () => {
  const setup = () => {
    const mux = { unwrapWebhook: jest.fn() };
    const service = { handleMuxEvent: jest.fn().mockResolvedValue(undefined) };
    const controller = new MuxWebhookController(mux as any, service as any);
    return { controller, mux, service };
  };

  it('confere a assinatura sobre o corpo cru', async () => {
    const { controller, mux, service } = setup();
    const state = { assetId: 'a', status: 'ready' };
    mux.unwrapWebhook.mockResolvedValue(state);
    const raw = Buffer.from('{"type":"video.asset.ready"}');

    await controller.handle({ rawBody: raw, body: {} } as any, {
      'mux-signature': 't=1,v1=abc',
    });

    expect(mux.unwrapWebhook).toHaveBeenCalledWith(raw, {
      'mux-signature': 't=1,v1=abc',
    });
    expect(service.handleMuxEvent).toHaveBeenCalledWith(state);
  });

  it('401 em assinatura inválida ou segredo ausente', async () => {
    const { controller, mux, service } = setup();
    mux.unwrapWebhook.mockRejectedValue(
      new Error('MUX_WEBHOOK_SECRET ausente'),
    );

    await expect(
      controller.handle({ rawBody: Buffer.from('{}') } as any, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.handleMuxEvent).not.toHaveBeenCalled();
  });

  it('evento irrelevante é aceito sem processar', async () => {
    const { controller, mux, service } = setup();
    mux.unwrapWebhook.mockResolvedValue(null);

    expect(
      await controller.handle({ rawBody: Buffer.from('{}') } as any, {}),
    ).toEqual({ received: true });
    expect(service.handleMuxEvent).not.toHaveBeenCalled();
  });
});
