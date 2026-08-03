import { BadRequestException } from '@nestjs/common';
import { StripeWebhookController } from './stripe-webhook.controller';

const EVENTO = {
  id: 'evt_1',
  type: 'checkout.session.completed',
  object: { id: 'cs_test_1' },
};

function build() {
  const service = { handleStripeEvent: jest.fn().mockResolvedValue(undefined) };
  const stripe = {
    verifySnapshotEvent: jest.fn().mockResolvedValue(EVENTO),
    verifyThinEvent: jest.fn().mockResolvedValue(EVENTO),
  };
  const controller = new StripeWebhookController(
    service as any,
    stripe as any,
  );
  const request = { rawBody: Buffer.from('{"id":"evt_1"}') } as any;
  return { controller, service, stripe, request };
}

describe('StripeWebhookController — os dois estilos de payload', () => {
  it('o endpoint instantâneo verifica pelo caminho do snapshot', async () => {
    const { controller, stripe, request } = build();

    await controller.snapshot(request, 'assinatura');

    expect(stripe.verifySnapshotEvent).toHaveBeenCalledWith(
      request.rawBody,
      'assinatura',
    );
    expect(stripe.verifyThinEvent).not.toHaveBeenCalled();
  });

  it('o endpoint mínimo verifica pelo caminho do thin', async () => {
    const { controller, stripe, request } = build();

    await controller.thin(request, 'assinatura');

    expect(stripe.verifyThinEvent).toHaveBeenCalledWith(
      request.rawBody,
      'assinatura',
    );
    expect(stripe.verifySnapshotEvent).not.toHaveBeenCalled();
  });

  it('os dois desembocam na mesma regra de domínio', async () => {
    const { controller, service, request } = build();

    await controller.snapshot(request, 'assinatura');
    await controller.thin(request, 'assinatura');

    expect(service.handleStripeEvent).toHaveBeenCalledTimes(2);
    expect(service.handleStripeEvent).toHaveBeenNthCalledWith(1, EVENTO);
    expect(service.handleStripeEvent).toHaveBeenNthCalledWith(2, EVENTO);
  });
});

describe('StripeWebhookController — recusa e retentativa', () => {
  it('assinatura inválida é 400, para o Stripe parar de reenviar', async () => {
    const { controller, service, stripe, request } = build();
    stripe.verifySnapshotEvent.mockRejectedValue(
      new Error('No signatures found matching the expected signature'),
    );

    await expect(
      controller.snapshot(request, 'assinatura-falsa'),
    ).rejects.toThrow(BadRequestException);
    expect(service.handleStripeEvent).not.toHaveBeenCalled();
  });

  it('sem corpo cru não há o que verificar', async () => {
    const { controller } = build();

    await expect(
      controller.snapshot({} as any, 'assinatura'),
    ).rejects.toThrow(BadRequestException);
  });

  it('falha ao processar propaga: a cobrança foi paga e o plano não ativou', async () => {
    const { controller, service, request } = build();
    service.handleStripeEvent.mockRejectedValue(new Error('Firestore fora'));

    await expect(controller.snapshot(request, 'assinatura')).rejects.toThrow(
      /Firestore fora/,
    );
  });
});
