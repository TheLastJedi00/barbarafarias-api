import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { SUBSCRIPTION_STATUS } from './subscription.entity';
import {
  ASSINATURA,
  CARTAO,
  PACOTE_CARTAO,
  PACOTE_PIX,
  buildTier,
  orderPaga,
} from './subscription.tier.fixtures';

/**
 * Cancelamento e desistência dos tiers (spec 035 §4, §5; decisões 8 e 10).
 *
 * | | até 7 dias | até o fim da fidelidade | depois |
 * |---|---|---|---|
 * | assinatura | cancela e estorna | 409 com a data | cancela as próximas |
 * | pacote | desiste e estorna | — sem cancelamento — | |
 */

/** Relógio parado num instante; o resto do loop de eventos segue real. */
function noDia(iso: string) {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(new Date(iso));
}

afterEach(() => jest.useRealTimers());

const PRE = {
  id: 'pre_1',
  subscriptionId: 'pre_1',
  provider: 'MERCADOPAGO',
  outcome: 'PENDING',
};

function cicloPago(paymentId = 987) {
  return {
    topic: 'subscription_authorized_payment',
    id: `ap_${paymentId}`,
    cycle: {
      id: `ap_${paymentId}`,
      preapproval_id: 'pre_1',
      status: 'processed',
      payment: { id: paymentId, status: 'approved', status_detail: 'accredited' },
    },
  } as any;
}

/** Assinatura do tier contratada em 20/11/2026 e com o 1º ciclo pago. */
async function assinaturaPaga() {
  noDia('2026-11-20T15:00:00Z');
  const built = buildTier();
  built.card.createCheckout.mockResolvedValue(PRE);
  await built.service.choosePlan('aluno-1', ASSINATURA);
  await built.service.payWithCard('aluno-1', CARTAO);
  await built.service.handleMercadoPagoEvent(cicloPago());
  return built;
}

describe('Assinatura do tier — cancelamento', () => {
  it('nos 7 dias da compra: cancela lá fora, estorna o ciclo pago e o acesso cai', async () => {
    const { service, card, subscriptions, users } = await assinaturaPaga();
    noDia('2026-11-27T15:00:00Z');

    const dto = await service.cancelSubscription('aluno-1');

    expect(card.cancelSubscription).toHaveBeenCalledWith('pre_1');
    expect(card.refundPayment).toHaveBeenCalledWith('987', 'withdraw:aluno-1:1');
    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.status).toBe(SUBSCRIPTION_STATUS.CANCELLED);
    expect(saved.accessUntil).toBeUndefined();
    expect(saved.paidInstallments).toBe(0);
    // Estornado não é receita: some do cronograma que o Financeiro soma.
    expect(saved.charges).toEqual([]);
    expect(saved.withdrawnAt).toBeDefined();
    expect(dto.status).toBe(SUBSCRIPTION_STATUS.CANCELLED);
    expect(users.updateSubscriptionState).toHaveBeenLastCalledWith(
      'aluno-1',
      expect.objectContaining({ isPaying: false, accessUntil: undefined }),
    );
  });

  it('nos 7 dias sem ciclo pago ainda: só cancela, não há o que estornar', async () => {
    noDia('2026-11-20T15:00:00Z');
    const { service, card } = buildTier();
    card.createCheckout.mockResolvedValue(PRE);
    await service.choosePlan('aluno-1', ASSINATURA);
    await service.payWithCard('aluno-1', CARTAO);

    await service.cancelSubscription('aluno-1');

    expect(card.cancelSubscription).toHaveBeenCalledWith('pre_1');
    expect(card.refundPayment).not.toHaveBeenCalled();
  });

  it('do 8º dia ao fim da fidelidade: 409 com a data em que passa a ser possível', async () => {
    const { service, card, subscriptions } = await assinaturaPaga();
    noDia('2026-11-28T15:00:00Z');

    const erro = await service.cancelSubscription('aluno-1').catch((e) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    expect(erro.getResponse()).toMatchObject({
      cancellableFrom: '2027-05-20',
      message: expect.stringMatching(/20\/05\/2027/),
    });
    expect(card.cancelSubscription).not.toHaveBeenCalled();
    expect(subscriptions.store.get('aluno-1')!.status).toBe(
      SUBSCRIPTION_STATUS.ACTIVE,
    );
  });

  it('depois da fidelidade: cancela as próximas e mantém o ciclo pago', async () => {
    const { service, card, subscriptions } = await assinaturaPaga();
    noDia('2027-05-20T15:00:00Z');

    await service.cancelSubscription('aluno-1');

    expect(card.cancelSubscription).toHaveBeenCalledWith('pre_1');
    expect(card.refundPayment).not.toHaveBeenCalled();
    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.status).toBe(SUBSCRIPTION_STATUS.CANCELLED);
    expect(saved.accessUntil).toBe('2026-12-20');
  });

  it('o pacote não se cancela: tem desistência, e só nos 7 dias', async () => {
    noDia('2026-11-20T15:00:00Z');
    const { service } = buildTier();
    await service.choosePlan('aluno-1', PACOTE_PIX);
    await service.handleMercadoPagoEvent(orderPaga('pix_1'));

    await expect(service.cancelSubscription('aluno-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('Pacote do tier — desistência em 7 dias (CDC)', () => {
  it('PIX pago: estorna a order inteira e o acesso cai', async () => {
    noDia('2026-11-20T15:00:00Z');
    const { service, pix, subscriptions } = buildTier();
    await service.choosePlan('aluno-1', PACOTE_PIX);
    await service.handleMercadoPagoEvent(orderPaga('pix_1'));
    noDia('2026-11-27T15:00:00Z');

    await service.withdraw('aluno-1');

    expect(pix.refundOrder).toHaveBeenCalledWith('pix_1', 'withdraw:aluno-1:1');
    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.status).toBe(SUBSCRIPTION_STATUS.CANCELLED);
    expect(saved.accessUntil).toBeUndefined();
    expect(saved.charges).toEqual([]);
  });

  it('cartão pago: estorna pela porta do cartão (o emissor cancela as parcelas que faltam)', async () => {
    noDia('2026-11-20T15:00:00Z');
    const { service, card } = buildTier();
    await service.choosePlan('aluno-1', PACOTE_CARTAO);
    await service.payWithCard('aluno-1', { ...CARTAO, installments: 6 });

    await service.withdraw('aluno-1');

    expect(card.refundOrder).toHaveBeenCalledWith(
      'ORD01ABC',
      'withdraw:aluno-1:1',
    );
  });

  it('a janela conta da data do pagamento, não da escolha do plano', async () => {
    noDia('2026-11-20T15:00:00Z');
    const { service, pix } = buildTier();
    await service.choosePlan('aluno-1', PACOTE_PIX);
    noDia('2026-11-25T15:00:00Z');
    await service.handleMercadoPagoEvent(orderPaga('pix_1'));
    noDia('2026-12-02T15:00:00Z');

    await service.withdraw('aluno-1');

    expect(pix.refundOrder).toHaveBeenCalled();
  });

  it('depois de 7 dias: 409, e nada é estornado', async () => {
    noDia('2026-11-20T15:00:00Z');
    const { service, pix } = buildTier();
    await service.choosePlan('aluno-1', PACOTE_PIX);
    await service.handleMercadoPagoEvent(orderPaga('pix_1'));
    noDia('2026-11-28T15:00:00Z');

    await expect(service.withdraw('aluno-1')).rejects.toThrow(ConflictException);
    expect(pix.refundOrder).not.toHaveBeenCalled();
  });

  it('pacote ainda não pago: desistir só encerra, sem estorno', async () => {
    noDia('2026-11-20T15:00:00Z');
    const { service, pix, subscriptions } = buildTier();
    await service.choosePlan('aluno-1', PACOTE_PIX);

    await service.withdraw('aluno-1');

    expect(pix.refundOrder).not.toHaveBeenCalled();
    expect(subscriptions.store.get('aluno-1')!.status).toBe(
      SUBSCRIPTION_STATUS.CANCELLED,
    );
  });

  it('a assinatura desiste pelo cancelamento, não por aqui', async () => {
    const { service } = await assinaturaPaga();
    await expect(service.withdraw('aluno-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('Assinatura do tier — encerrada fora da plataforma (decisão 10)', () => {
  it('na fidelidade: sem multa, acesso até o fim do ciclo pago e quebra registrada', async () => {
    const { service, subscriptions, users } = await assinaturaPaga();
    noDia('2026-12-05T15:00:00Z');

    await service.handleMercadoPagoEvent({
      topic: 'subscription_preapproval',
      id: 'pre_1',
      status: 'cancelled',
    } as any);

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.status).toBe(SUBSCRIPTION_STATUS.CANCELLED);
    expect(saved.accessUntil).toBe('2026-12-20');
    expect(saved.fidelityBrokenAt).toBeDefined();
    expect(users.updateSubscriptionState).toHaveBeenLastCalledWith(
      'aluno-1',
      expect.objectContaining({
        accessUntil: '2026-12-20',
        fidelityBrokenAt: saved.fidelityBrokenAt,
      }),
    );
  });

  it('depois da fidelidade não é quebra', async () => {
    const { service, subscriptions } = await assinaturaPaga();
    noDia('2027-06-01T15:00:00Z');

    await service.handleMercadoPagoEvent({
      topic: 'subscription_preapproval',
      id: 'pre_1',
      status: 'cancelled',
    } as any);

    expect(subscriptions.store.get('aluno-1')!.fidelityBrokenAt).toBeUndefined();
  });

  it('renovação recusada continua bloqueando (PAST_DUE)', async () => {
    const { service, subscriptions } = await assinaturaPaga();

    await service.handleMercadoPagoEvent({
      topic: 'subscription_authorized_payment',
      id: 'ap_2',
      cycle: {
        id: 'ap_2',
        preapproval_id: 'pre_1',
        status: 'processed',
        payment: { id: 2, status: 'rejected', status_detail: 'cc_rejected' },
      },
    } as any);

    expect(subscriptions.store.get('aluno-1')!.status).toBe(
      SUBSCRIPTION_STATUS.PAST_DUE,
    );
  });
});
