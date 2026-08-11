import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SubscriptionService, addMonths } from './subscription.service';
import {
  CHARGE_STATUS,
  PAYMENT_METHODS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUS,
  Subscription,
} from './subscription.entity';
import { Coupon, applyDiscount } from './coupon.entity';

/** Repositório em memória: a regra sob teste é o cronograma, não o Firestore. */
function fakeSubscriptionRepository() {
  const store = new Map<string, Subscription>();
  return {
    store,
    findByStudent: jest.fn(async (id: string) => store.get(id) ?? null),
    findAll: jest.fn(async () => [...store.values()]),
    findByStatus: jest.fn(async (status: string) =>
      [...store.values()].filter((item) => item.status === status),
    ),
    findByChargeId: jest.fn(
      async (chargeId: string) =>
        [...store.values()].find((item) =>
          item.charges.some((charge) => charge.gatewayChargeId === chargeId),
        ) ?? null,
    ),
    findByGatewaySubscriptionId: jest.fn(
      async (id: string) =>
        [...store.values()].find((item) => item.gatewaySubscriptionId === id) ??
        null,
    ),
    save: jest.fn(async (subscription: Subscription) => {
      store.set(subscription.studentId, subscription);
      return subscription;
    }),
    delete: jest.fn(async (id: string) => void store.delete(id)),
  };
}

function build(overrides: Record<string, any> = {}) {
  const subscriptions = fakeSubscriptionRepository();
  const coupons = {
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    findByCode: jest.fn().mockResolvedValue(null),
    create: jest.fn(async (coupon: Coupon) => coupon),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const users = {
    findById: jest.fn().mockResolvedValue({
      id: 'aluno-1',
      fullName: 'Ana Aluna',
      email: 'ana@example.com',
      phone: '11999999999',
      // `assertPayableProfile` (spec 013 Task 45.3) barra o checkout sem CPF.
      cpf: '39053344705',
    }),
    updateSubscriptionState: jest.fn().mockResolvedValue(undefined),
  };
  const pix = {
    isEnabled: jest.fn().mockReturnValue(true),
    createPixCharge: jest.fn().mockResolvedValue({
      id: 'pix_1',
      brCode: '000201...',
      brCodeBase64: 'data:image/png;base64,AAA',
    }),
    simulatePayment: jest.fn().mockResolvedValue(true),
  };
  const card = {
    isEnabled: jest.fn().mockReturnValue(true),
    createCheckout: jest.fn().mockResolvedValue({
      id: 'ORD01ABC',
      provider: 'MERCADOPAGO',
      outcome: 'PAID',
    }),
    cancelSubscription: jest.fn().mockResolvedValue(undefined),
    updateSubscriptionAmount: jest.fn().mockResolvedValue(undefined),
    fetchChargeOutcome: jest.fn().mockResolvedValue({
      id: 'ORD01ABC',
      provider: 'MERCADOPAGO',
      outcome: 'PAID',
    }),
  };
  const acceptances = {
    create: jest.fn(async (acceptance: any) => acceptance),
    findAll: jest.fn().mockResolvedValue([]),
  };
  const config = { get: jest.fn(() => undefined) };
  Object.assign(config, overrides.config ?? {});

  const service = new SubscriptionService(
    subscriptions as any,
    coupons as any,
    users as any,
    acceptances as any,
    pix as any,
    card as any,
    config as any,
  );
  return {
    service,
    subscriptions,
    coupons,
    users,
    acceptances,
    pix,
    card,
    config,
  };
}

/**
 * Notificação de order paga, como o webhook a entrega depois de buscar o
 * recurso. **O par completo**: `processed` sozinho não confirma nada.
 */
function orderPaga(id = 'pix_1') {
  return {
    topic: 'order' as const,
    id,
    order: { id, status: 'processed', status_detail: 'accredited' },
  };
}

/** Cartão como o formulário do gateway o entrega: token, e nada mais. */
const CARTAO_TOKEN = { token: 'tok_123', paymentMethodId: 'master' };

/** Aceite dos termos, exigido em toda contratação (spec 023 §7.2). */
const ACEITE = { termsVersion: '2026-08-1', accepted: true };

const PIX = {
  plan: SUBSCRIPTION_PLANS.MONTHLY,
  paymentMethod: PAYMENT_METHODS.PIX_RECURRING,
  acceptance: ACEITE,
};

describe('addMonths', () => {
  it('preserva o dia do mês', () => {
    expect(addMonths('2026-08-05', 1)).toBe('2026-09-05');
    expect(addMonths('2026-08-05', 12)).toBe('2027-08-05');
  });

  it('encolhe para o último dia quando o mês seguinte é mais curto', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
});

describe('SubscriptionService — cronograma de parcelas', () => {
  it('mensal nasce recorrente: uma parcela conceitual e renovações projetadas', async () => {
    const { service, subscriptions } = build();

    await service.choosePlan('aluno-1', PIX as any);

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.installments).toBe(1);
    expect(saved.installmentAmount).toBe(240);
    expect(saved.charges).toHaveLength(6);
    expect(saved.charges.every((charge) => charge.amount === 240)).toBe(true);
  });

  it('semestral gera 6 parcelas de R$ 200', async () => {
    const { service, subscriptions } = build();

    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.SEMIANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.installments).toBe(6);
    expect(saved.charges).toHaveLength(6);
    expect(saved.totalAmount).toBe(1200);
    expect(saved.charges.map((charge) => charge.amount)).toEqual(
      Array(6).fill(200),
    );
  });

  it('anual gera 12 parcelas de R$ 180', async () => {
    const { service, subscriptions } = build();

    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.ANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.charges).toHaveLength(12);
    expect(saved.totalAmount).toBe(2160);
  });

  it('as parcelas vencem mês a mês a partir de hoje', async () => {
    const { service, subscriptions } = build();

    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.SEMIANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);

    const { charges, startDate, nextChargeDate } =
      subscriptions.store.get('aluno-1')!;
    expect(charges[0].dueDate).toBe(startDate);
    expect(charges[1].dueDate).toBe(addMonths(startDate, 1));
    expect(charges[5].dueDate).toBe(addMonths(startDate, 5));
    expect(nextChargeDate).toBe(charges[0].dueDate);
  });

  it('o plano nasce PENDING e só vira ACTIVE quando a cobrança é confirmada', async () => {
    const { service, subscriptions } = build();

    await service.choosePlan('aluno-1', PIX as any);
    expect(subscriptions.store.get('aluno-1')!.status).toBe(
      SUBSCRIPTION_STATUS.PENDING,
    );

    await service.handleMercadoPagoEvent(orderPaga());

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
    expect(saved.paidInstallments).toBe(1);
  });

  it('recusa contratar um segundo plano com assinatura ativa', async () => {
    const { service, subscriptions } = build();
    await service.choosePlan('aluno-1', PIX as any);
    subscriptions.store.get('aluno-1')!.status = SUBSCRIPTION_STATUS.ACTIVE;

    await expect(service.choosePlan('aluno-1', PIX as any)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('SubscriptionService — não cobrar duas vezes', () => {
  const ANUAL = {
    plan: SUBSCRIPTION_PLANS.ANNUAL,
    paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
    acceptance: ACEITE,
  };

  /**
   * Cobrança já enviada ao gateway e **não** confirmada aqui — o estado exato
   * em que a cobrança dupla aconteceu: aprovada lá, pendente cá.
   */
  async function comCobrancaEmAberto() {
    const context = build();
    context.card.createCheckout.mockResolvedValue({
      id: 'ORD01ABC',
      provider: 'MERCADOPAGO',
      outcome: 'CHALLENGE',
      challengeUrl: 'https://mp/challenge',
    });
    await context.service.choosePlan('aluno-1', ANUAL as any);
    await context.service.payWithCard('aluno-1', CARTAO_TOKEN as any);
    context.card.createCheckout.mockClear();
    return context;
  }

  it('cobrança já paga no gateway NÃO vira uma segunda cobrança', async () => {
    const { service, card, subscriptions } = await comCobrancaEmAberto();
    card.fetchChargeOutcome.mockResolvedValue({
      id: 'ORD01ABC',
      provider: 'MERCADOPAGO',
      outcome: 'PAID',
    });

    const result = await service.payWithCard('aluno-1', {
      token: 'tok_outro',
      paymentMethodId: 'master',
    } as any);

    // Aconteceu de verdade em teste: aprovada no gateway, não confirmada aqui,
    // o aluno tentou de novo e o token novo gerou chave nova — **duas** ordens
    // de R$ 2.280. A chave por tentativa está certa; faltava esta pergunta.
    expect(card.createCheckout).not.toHaveBeenCalled();
    expect(result.outcome).toBe('PAID');
    expect(subscriptions.store.get('aluno-1')!.status).toBe(
      SUBSCRIPTION_STATUS.ACTIVE,
    );
  });

  it('desafio já aberto é reaproveitado, não duplicado', async () => {
    const { service, card } = await comCobrancaEmAberto();
    card.fetchChargeOutcome.mockResolvedValue({
      id: 'ORD01ABC',
      provider: 'MERCADOPAGO',
      outcome: 'CHALLENGE',
      challengeUrl: 'https://mp/challenge',
    });

    const result = await service.payWithCard('aluno-1', CARTAO_TOKEN as any);

    expect(card.createCheckout).not.toHaveBeenCalled();
    expect(result.challengeUrl).toBe('https://mp/challenge');
    // Reaproveitar **em silêncio** é um beco: a tela reabre o mesmo desafio a
    // cada tentativa e nada explica por que não avança.
    expect(result.warning).toMatch(/verificação do banco em aberto/i);
    // E **não** promete prazo: uma order abandonada foi vista em
    // `pending_challenge` muito além dos 40 minutos da doc. Prometer o prazo
    // seria repetir na tela um número que o provedor não cumpre.
    expect(result.warning).not.toMatch(/\d+\s*minutos?/i);
  });

  it('cobrança recusada libera a retentativa', async () => {
    const { service, card } = await comCobrancaEmAberto();
    card.fetchChargeOutcome.mockResolvedValue({
      id: 'ORD01ABC',
      provider: 'MERCADOPAGO',
      outcome: 'REJECTED',
    });

    await service.payWithCard('aluno-1', CARTAO_TOKEN as any);

    // Cartão recusado é rotina — travar aqui seria trocar cobrança dupla por
    // venda perdida.
    expect(card.createCheckout).toHaveBeenCalledTimes(1);
  });

  it('falha ao reler não impede a cobrança', async () => {
    const { service, card } = await comCobrancaEmAberto();
    card.fetchChargeOutcome.mockRejectedValue(new Error('rede'));

    await service.payWithCard('aluno-1', CARTAO_TOKEN as any);

    // Travar a contratação por causa de uma consulta seria trocar um risco
    // raro por um impedimento certo.
    expect(card.createCheckout).toHaveBeenCalledTimes(1);
  });

  it('no mensal, assinatura já criada não vira uma segunda', async () => {
    const { service, card } = build();
    card.createCheckout.mockResolvedValue({
      id: 'preapproval_1',
      subscriptionId: 'preapproval_1',
      provider: 'MERCADOPAGO',
      outcome: 'PENDING',
    });
    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.MONTHLY,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);
    await service.payWithCard('aluno-1', CARTAO_TOKEN as any);
    card.createCheckout.mockClear();

    await service.payWithCard('aluno-1', CARTAO_TOKEN as any);

    // Uma segunda assinatura colocaria o aluno em dois `preapproval` cobrando
    // todo mês, **para sempre**. É pior que a cobrança dupla do parcelado.
    expect(card.createCheckout).not.toHaveBeenCalled();
  });
});

describe('SubscriptionService — releitura da cobrança de cartão', () => {
  const ANUAL = {
    plan: SUBSCRIPTION_PLANS.ANNUAL,
    paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
    acceptance: ACEITE,
  };

  /** Plano de cartão com a cobrança em aberto, como o desafio 3DS a deixa. */
  async function comDesafioAberto() {
    const context = build();
    context.card.createCheckout.mockResolvedValue({
      id: 'ORD01ABC',
      provider: 'MERCADOPAGO',
      outcome: 'CHALLENGE',
      challengeUrl: 'https://mp/challenge',
    });
    await context.service.choosePlan('aluno-1', ANUAL as any);
    await context.service.payWithCard('aluno-1', CARTAO_TOKEN as any);
    return context;
  }

  it('desafio concluído e creditado ativa o plano', async () => {
    const { service, subscriptions } = await comDesafioAberto();
    expect(subscriptions.store.get('aluno-1')!.status).toBe(
      SUBSCRIPTION_STATUS.PENDING,
    );

    const result = await service.refreshCardPayment('aluno-1');

    // O `postMessage` do iframe diz que a **etapa** acabou, não que o
    // pagamento passou. Quem sabe é a order — e é ela que se lê aqui.
    expect(result.outcome).toBe('PAID');
    expect(subscriptions.store.get('aluno-1')!.status).toBe(
      SUBSCRIPTION_STATUS.ACTIVE,
    );
  });

  it('desafio ainda pendente não ativa nada', async () => {
    const { service, subscriptions, card } = await comDesafioAberto();
    card.fetchChargeOutcome.mockResolvedValue({
      id: 'ORD01ABC',
      provider: 'MERCADOPAGO',
      outcome: 'CHALLENGE',
      challengeUrl: 'https://mp/challenge',
    });

    const result = await service.refreshCardPayment('aluno-1');

    expect(result.outcome).toBe('CHALLENGE');
    expect(subscriptions.store.get('aluno-1')!.status).toBe(
      SUBSCRIPTION_STATUS.PENDING,
    );
  });

  it('desafio recusado não ativa nada', async () => {
    const { service, subscriptions, card } = await comDesafioAberto();
    card.fetchChargeOutcome.mockResolvedValue({
      id: 'ORD01ABC',
      provider: 'MERCADOPAGO',
      outcome: 'REJECTED',
      detail: 'cc_rejected_3ds_challenge',
    });

    const result = await service.refreshCardPayment('aluno-1');

    expect(result.outcome).toBe('REJECTED');
    expect(subscriptions.store.get('aluno-1')!.status).toBe(
      SUBSCRIPTION_STATUS.PENDING,
    );
  });

  it('reler duas vezes não reconfirma o que já estava pago', async () => {
    const { service, subscriptions } = await comDesafioAberto();

    await service.refreshCardPayment('aluno-1');
    const depoisDaPrimeira = subscriptions
      .store.get('aluno-1')!
      .charges.map((charge) => charge.paidAt);

    await service.refreshCardPayment('aluno-1');

    // O Anual é uma cobrança só: a primeira releitura quita o plano inteiro.
    // A segunda não pode mexer em nada — nem no número, nem nos carimbos, que
    // são o que prova *quando* cada parcela foi liquidada.
    expect(subscriptions.store.get('aluno-1')!.paidInstallments).toBe(12);
    expect(
      subscriptions.store.get('aluno-1')!.charges.map((c) => c.paidAt),
    ).toEqual(depoisDaPrimeira);
  });

  it('plano fechado quita o cronograma inteiro, preservando as datas', async () => {
    const { service, subscriptions } = await comDesafioAberto();
    const vencimentos = subscriptions
      .store.get('aluno-1')!
      .charges.map((charge) => charge.dueDate);

    await service.refreshCardPayment('aluno-1');

    const plano = subscriptions.store.get('aluno-1')!;
    // O emissor é que divide em 12; do nosso lado saiu **uma** cobrança. Deixar
    // onze "pendentes" que o banco já cobrou é o que fazia o painel da gerente
    // mostrar dívida onde não há.
    expect(plano.charges.every((c) => c.status === CHARGE_STATUS.PAID)).toBe(
      true,
    );
    expect(plano.paidInstallments).toBe(12);
    // E **não** há próxima: o plano está quitado.
    expect(plano.nextChargeDate).toBeUndefined();
    // O vencimento de cada parcela sobrevive à quitação, senão a receita
    // desabaria toda no mês da compra em vez de correr por competência.
    expect(plano.charges.map((c) => c.dueDate)).toEqual(vencimentos);
  });

  it('no mensal só a parcela do ciclo é quitada', async () => {
    const { service, subscriptions, card } = build();
    card.createCheckout.mockResolvedValue({
      id: 'preapproval_1',
      provider: 'MERCADOPAGO',
      outcome: 'PAID',
    });
    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.MONTHLY,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);

    await service.payWithCard('aluno-1', CARTAO_TOKEN as any);

    // Aqui a divisão é real: cada mês é uma cobrança que ainda vai acontecer.
    // Quitar o cronograma daria acesso pago por meses que ninguém pagou.
    expect(subscriptions.store.get('aluno-1')!.paidInstallments).toBe(1);
  });

  it('no mensal não relê nada: lá fora é assinatura, não order', async () => {
    const { service, card } = build();
    card.createCheckout.mockResolvedValue({
      id: 'preapproval_1',
      subscriptionId: 'preapproval_1',
      provider: 'MERCADOPAGO',
      outcome: 'PENDING',
    });
    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.MONTHLY,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);
    await service.payWithCard('aluno-1', CARTAO_TOKEN as any);

    const result = await service.refreshCardPayment('aluno-1');

    // Reler o id do `preapproval` como se fosse order daria 404. A primeira
    // cobrança sai em até ~1h e quem confirma é o webhook.
    expect(card.fetchChargeOutcome).not.toHaveBeenCalled();
    expect(result.outcome).toBe('PENDING');
  });

  it('sem cobrança emitida não há o que reler', async () => {
    const { service, card } = build();
    await service.choosePlan('aluno-1', ANUAL as any);

    const result = await service.refreshCardPayment('aluno-1');

    expect(card.fetchChargeOutcome).not.toHaveBeenCalled();
    expect(result.outcome).toBe('PENDING');
  });
});

describe('SubscriptionService — aceite dos termos', () => {
  it('o aceite é gravado dentro da contratação, com os números congelados', async () => {
    const { service, acceptances } = build();

    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.ANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);

    expect(acceptances.create).toHaveBeenCalledTimes(1);
    const gravado = acceptances.create.mock.calls[0][0];
    expect(gravado).toMatchObject({
      studentId: 'aluno-1',
      studentName: 'Ana Aluna',
      studentEmail: 'ana@example.com',
      plan: 'ANNUAL',
      planLabel: 'Anual',
      // Congelados, não referenciados: o catálogo muda de preço e o contrato
      // assinado não muda junto.
      //
      // E são os valores **do pagador**: é com o total parcelado que ela
      // concordou, não com a base que cobramos do provedor.
      totalAmount: 2637.58,
      installments: 12,
      installmentAmount: 219.8,
      termsVersion: '2026-08-1',
    });
    // ISO **com hora**: "concordou em 10/08" não responde a mesma pergunta que
    // "concordou às 22h47 de 10/08".
    expect(gravado.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it('não grava IP nem user-agent', async () => {
    const { service, acceptances } = build();

    await service.choosePlan('aluno-1', PIX as any);

    // Dado pessoal novo, sem base declarada, para um ganho probatório que
    // `studentId` autenticado + timestamp já entrega.
    const gravado = acceptances.create.mock.calls[0][0];
    expect(gravado.ip).toBeUndefined();
    expect(gravado.userAgent).toBeUndefined();
  });

  it('o cupom acordado fica registrado junto', async () => {
    const { service, acceptances, coupons } = build();
    coupons.findByCode.mockResolvedValue(
      new Coupon({
        id: 'c1',
        code: 'BEMVINDA',
        discountAmount: 50,
        durationMonths: null,
        active: true,
        createdAt: '',
        createdBy: '',
      }),
    );

    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.SEMIANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      couponCode: 'BEMVINDA',
      acceptance: ACEITE,
    } as any);

    const gravado = acceptances.create.mock.calls[0][0];
    expect(gravado.couponCode).toBe('BEMVINDA');
    // O total congelado é o **descontado**, que é o que foi acordado: os juros
    // do parcelamento incidem sobre o que sobrou do cupom, não sobre a tabela.
    // Congelar o valor de tabela cobraria juros sobre dinheiro que ninguém
    // pagou e apagaria o desconto justamente de onde ele prova alguma coisa.
    expect(gravado.totalAmount).toBe(1028.88);
  });

  it('falhar ao gravar o aceite derruba a contratação, e nada é cobrado', async () => {
    const { service, acceptances, pix, subscriptions } = build();
    acceptances.create.mockRejectedValue(new Error('firestore fora'));

    await expect(service.choosePlan('aluno-1', PIX as any)).rejects.toThrow();

    // Ao contrário do espelho no usuário e do gateway, que degradam: os dois
    // são conveniência, este é o registro que autoriza a cobrança.
    expect(pix.createPixCharge).not.toHaveBeenCalled();
    expect(subscriptions.store.get('aluno-1')).toBeUndefined();
  });

  it('cada contratação gera um registro novo, nunca sobrescreve', async () => {
    const { service, acceptances, subscriptions } = build();

    await service.choosePlan('aluno-1', PIX as any);
    await service.cancelSubscription('aluno-1');
    subscriptions.store.delete('aluno-1');
    await service.choosePlan('aluno-1', PIX as any);

    const ids = acceptances.create.mock.calls.map((call: any[]) => call[0].id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe('SubscriptionService — pagamento', () => {
  it('PIX devolve QR Code e copia-e-cola para o modal', async () => {
    const { service } = build();

    const response = await service.choosePlan('aluno-1', PIX as any);

    expect(response.pixQrCodeUrl).toContain('base64');
    expect(response.pixCopyPaste).toBe('000201...');
  });

  it('contratar no cartão grava o plano e devolve o que o formulário precisa', async () => {
    const { service, pix, card } = build();

    const response = await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.ANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);

    // **A cobrança ainda não existe, e é de propósito**: o token do cartão
    // nasce no navegador, depois desta resposta. Quem cobra é `payWithCard`.
    expect(card.createCheckout).not.toHaveBeenCalled();
    expect(pix.createPixCharge).not.toHaveBeenCalled();
    expect(response.card).toEqual({
      amount: 2160,
      installments: 12,
      chargeIndex: 1,
    });
    expect(response.pixCopyPaste).toBeUndefined();
  });

  it('o anual vai em 12x e o semestral em 6x, tirados do catálogo', async () => {
    const anual = build();
    await anual.service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.ANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);
    await anual.service.payWithCard('aluno-1', CARTAO_TOKEN as any);

    expect(anual.card.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        installments: 12,
        // O total do catálogo, não a parcela: é **uma** cobrança que o emissor
        // divide, não doze cobranças mensais.
        amount: 2160,
        recurring: { cycles: 12 },
      }),
    );

    const semestral = build();
    await semestral.service.choosePlan('aluno-2', {
      plan: SUBSCRIPTION_PLANS.SEMIANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);
    await semestral.service.payWithCard('aluno-2', CARTAO_TOKEN as any);

    expect(semestral.card.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ installments: 6, amount: 1200 }),
    );
  });

  it('o mensal abre assinatura recorrente, não pedido parcelado', async () => {
    const { service, card } = build();
    card.createCheckout.mockResolvedValue({
      id: 'preapproval_1',
      subscriptionId: 'preapproval_1',
      provider: 'MERCADOPAGO',
      outcome: 'PENDING',
    });

    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.MONTHLY,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);
    await service.payWithCard('aluno-1', CARTAO_TOKEN as any);

    expect(card.createCheckout).toHaveBeenCalledWith(
      // `cycles: null` é a régua que manda o gateway abrir `preapproval`.
      expect.objectContaining({ recurring: { cycles: null }, amount: 240 }),
    );
  });

  it('o número de parcelas ignora o que o cliente mandar', async () => {
    const { service, card } = build();
    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.ANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);

    // A DTO nem tem o campo, mas alguém pode reintroduzi-lo: a trava do
    // formulário é conveniência, esta assertiva é a régua.
    await service.payWithCard('aluno-1', {
      ...CARTAO_TOKEN,
      installments: 1,
    } as any);

    expect(card.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ installments: 12 }),
    );
  });

  it('o cupom vai abatido no total, com o código ao lado', async () => {
    const { service, card, coupons } = build();
    coupons.findByCode.mockResolvedValue(
      new Coupon({
        id: 'c1',
        code: 'BEMVINDA',
        discountAmount: 50,
        durationMonths: 3,
        active: true,
        createdAt: '',
        createdBy: '',
      }),
    );

    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.SEMIANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      couponCode: 'BEMVINDA',
      acceptance: ACEITE,
    } as any);
    await service.payWithCard('aluno-1', CARTAO_TOKEN as any);

    // 3 parcelas com R$ 50 de desconto: 1200 - 150.
    expect(card.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1050, couponCode: 'BEMVINDA' }),
    );
    // Sem objeto de desconto: num pagamento único não há renovação para o
    // gateway descontar, e um segundo lugar dizendo quanto o aluno deve é uma
    // segunda fonte de verdade.
    expect(card.createCheckout.mock.calls[0][0].coupon).toBeUndefined();
  });

  it('PIX não toca a porta de cartão', async () => {
    const { service, card } = build();

    await service.choosePlan('aluno-1', PIX as any);

    expect(card.createCheckout).not.toHaveBeenCalled();
  });

  it('o plano recebe o cartão mesmo com o PIX fora do ar', async () => {
    const { service, pix } = build();
    pix.isEnabled.mockReturnValue(false);

    const response = await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.ANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);

    expect(response.card).toBeDefined();
    expect(response.warning).toBeUndefined();
  });

  it('sem gateway configurado o plano é gravado com aviso, não com erro', async () => {
    const { service, pix, subscriptions } = build();
    pix.isEnabled.mockReturnValue(false);

    const response = await service.choosePlan('aluno-1', PIX as any);

    expect(response.warning).toBeTruthy();
    expect(subscriptions.store.get('aluno-1')).toBeDefined();
  });

  it('trocar de PIX para cartão solta a cobrança antiga antes de reemitir', async () => {
    const { service, subscriptions } = build();
    await service.choosePlan('aluno-1', PIX as any);
    expect(subscriptions.store.get('aluno-1')!.charges[0].gatewayChargeId).toBe(
      'pix_1',
    );

    const response = await service.changePaymentMethod('aluno-1', {
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
    });

    // Sem soltar o vínculo, o webhook do PIX abandonado ainda marcaria a
    // parcela como paga — e o aluno teria pago no cartão pela mesma coisa.
    expect(
      subscriptions.store.get('aluno-1')!.charges[0].gatewayChargeId,
    ).toBeUndefined();
    expect(response.card).toBeDefined();
  });

  it('o webhook é idempotente: reprocessar não conta a parcela duas vezes', async () => {
    const { service, subscriptions } = build();
    await service.choosePlan('aluno-1', PIX as any);
    const paid = orderPaga();

    await service.handleMercadoPagoEvent(paid);
    await service.handleMercadoPagoEvent(paid);
    await service.handleMercadoPagoEvent(paid);

    expect(subscriptions.store.get('aluno-1')!.paidInstallments).toBe(1);
  });

  it('order que não está creditada não confirma parcela nenhuma', async () => {
    const { service, subscriptions } = build();
    await service.choosePlan('aluno-1', PIX as any);

    // PIX emitido e ainda não pago. `action_required` é o estado normal de um
    // QR no ar — tratá-lo como sucesso liberaria acesso sem dinheiro.
    await service.handleMercadoPagoEvent({
      topic: 'order',
      id: 'pix_1',
      order: { status: 'action_required', status_detail: 'waiting_transfer' },
    });

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.status).toBe(SUBSCRIPTION_STATUS.PENDING);
    expect(saved.paidInstallments).toBe(0);
  });

  it('pagar uma renovação do mensal projeta a próxima', async () => {
    const { service, subscriptions } = build();
    await service.choosePlan('aluno-1', PIX as any);

    await service.handleMercadoPagoEvent(orderPaga());

    const saved = subscriptions.store.get('aluno-1')!;
    // 6 pendentes continuam à frente, agora com a paga arquivada atrás.
    expect(saved.charges).toHaveLength(7);
    expect(
      saved.charges.filter((charge) => charge.status === CHARGE_STATUS.PENDING),
    ).toHaveLength(6);
  });
});

describe('SubscriptionService — cupons', () => {
  const cupom = new Coupon({
    id: 'c1',
    code: 'BEMVINDA',
    discountAmount: 50,
    durationMonths: 3,
    active: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    createdBy: 'gerente',
  });

  it('aplica o desconto só nas parcelas cobertas pela duração', async () => {
    const { service, subscriptions, coupons } = build();
    coupons.findByCode.mockResolvedValue(cupom);

    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.SEMIANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      couponCode: 'bemvinda',
      acceptance: ACEITE,
    } as any);

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.charges.map((charge) => charge.amount)).toEqual([
      150, 150, 150, 200, 200, 200,
    ]);
    expect(saved.totalAmount).toBe(1050);
    expect(saved.couponCode).toBe('BEMVINDA');
  });

  it('cupom vitalício vale para todas as parcelas', async () => {
    const { service, subscriptions, coupons } = build();
    coupons.findByCode.mockResolvedValue(
      new Coupon({ ...cupom, durationMonths: null }),
    );

    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.SEMIANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      couponCode: 'BEMVINDA',
      acceptance: ACEITE,
    } as any);

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.charges.every((charge) => charge.amount === 150)).toBe(true);
  });

  it('a parcela nunca fica negativa', () => {
    expect(applyDiscount(200, 500)).toBe(0);
    expect(applyDiscount(200, 50)).toBe(150);
  });

  it('parcela zerada pelo cupom é confirmada sem ir ao gateway', async () => {
    const { service, subscriptions, pix, coupons } = build();
    coupons.findByCode.mockResolvedValue(
      new Coupon({ ...cupom, discountAmount: 999, durationMonths: null }),
    );

    await service.choosePlan('aluno-1', {
      ...PIX,
      couponCode: 'BEMVINDA',
    } as any);

    expect(pix.createPixCharge).not.toHaveBeenCalled();
    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.charges[0].amount).toBe(0);
    expect(saved.charges[0].status).toBe(CHARGE_STATUS.PAID);
    expect(saved.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
  });

  it('recusa cupom inexistente ou desativado', async () => {
    const { service, coupons } = build();
    coupons.findByCode.mockResolvedValue(
      new Coupon({ ...cupom, active: false }),
    );

    await expect(
      service.choosePlan('aluno-1', { ...PIX, couponCode: 'X' } as any),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('SubscriptionService — cancelamento e cobranças', () => {
  it('cancelar guarda a data e apaga as parcelas ainda não pagas', async () => {
    const { service, subscriptions } = build();
    await service.choosePlan('aluno-1', PIX as any);
    await service.handleMercadoPagoEvent(orderPaga());

    const cancelled = await service.cancelSubscription('aluno-1');

    expect(cancelled.status).toBe(SUBSCRIPTION_STATUS.CANCELLED);
    expect(cancelled.cancelledAt).toBeTruthy();
    expect(cancelled.nextChargeDate).toBeUndefined();
    expect(subscriptions.store.get('aluno-1')!.charges).toHaveLength(1);
  });

  it('cancelar o parcelado preserva o acesso do período comprado', async () => {
    const { service, subscriptions, card } = build();
    card.createCheckout.mockResolvedValue({
      id: 'ORD01ABC',
      provider: 'MERCADOPAGO',
      outcome: 'PAID',
    });
    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.ANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);
    await service.payWithCard('aluno-1', CARTAO_TOKEN as any);
    const { startDate } = subscriptions.store.get('aluno-1')!;

    const cancelled = await service.cancelSubscription('aluno-1');

    // O dinheiro já saiu inteiro e o emissor continua faturando. Derrubar o
    // acesso aqui seria cobrar por um ano e entregar o dia do cancelamento.
    expect(cancelled.status).toBe(SUBSCRIPTION_STATUS.CANCELLED);
    expect(subscriptions.store.get('aluno-1')!.accessUntil).toBe(
      addMonths(startDate, 12),
    );
  });

  it('cancelar o mensal vale até o fim do ciclo já pago', async () => {
    const { service, subscriptions, card } = build();
    card.createCheckout.mockResolvedValue({
      id: 'preapproval_1',
      provider: 'MERCADOPAGO',
      outcome: 'PAID',
    });
    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.MONTHLY,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);
    await service.payWithCard('aluno-1', CARTAO_TOKEN as any);
    const { startDate } = subscriptions.store.get('aluno-1')!;

    await service.cancelSubscription('aluno-1');

    // Aqui cancelar tem efeito real sobre dinheiro: evita as **próximas**. O
    // mês pago, esse, continua valendo.
    expect(subscriptions.store.get('aluno-1')!.accessUntil).toBe(
      addMonths(startDate, 1),
    );
  });

  it('cancelar sem nada pago não inventa acesso', async () => {
    const { service, subscriptions } = build();
    await service.choosePlan('aluno-1', PIX as any);

    await service.cancelSubscription('aluno-1');

    expect(subscriptions.store.get('aluno-1')!.accessUntil).toBeUndefined();
  });

  it('próximas cobranças trazem só o que ainda não foi pago, em ordem de vencimento', async () => {
    const { service } = build();
    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.SEMIANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);

    const upcoming = await service.getUpcomingCharges('aluno-1');

    expect(upcoming).toHaveLength(6);
    expect(upcoming[0].index).toBe(1);
    expect(
      upcoming.every((charge) => charge.status !== CHARGE_STATUS.PAID),
    ).toBe(true);
  });

  it('aluno sem plano não tem cobranças', async () => {
    const { service } = build();
    await expect(service.getUpcomingCharges('ninguem')).resolves.toEqual([]);
  });
});

describe('SubscriptionService — ciclo de vida da assinatura no gateway', () => {
  const CARTAO = {
    plan: SUBSCRIPTION_PLANS.MONTHLY,
    paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
  };

  /** Assinatura de cartão já ativa, como o webhook a deixaria. */
  async function comAssinaturaAtiva() {
    const context = build();
    await context.service.choosePlan('aluno-1', {
      ...CARTAO,
      acceptance: ACEITE,
    } as any);
    const saved = context.subscriptions.store.get('aluno-1')!;
    saved.gatewaySubscriptionId = 'preapproval_1';
    saved.status = SUBSCRIPTION_STATUS.ACTIVE;
    return context;
  }

  /** Parcela do mensal, como `/authorized_payments/{id}` a devolve. */
  function parcela(statusDetail?: string) {
    return {
      topic: 'subscription_authorized_payment' as const,
      id: 'ap_1',
      cycle: {
        id: 'ap_1',
        preapproval_id: 'preapproval_1',
        // `processed` nos dois casos: é o pagamento que desempata.
        status: 'processed',
        payment: statusDetail
          ? { id: 'pay_1', status_detail: statusDetail }
          : undefined,
      },
    };
  }

  it('cancelar o plano encerra a assinatura no gateway', async () => {
    const { service, card } = await comAssinaturaAtiva();

    await service.cancelSubscription('aluno-1');

    expect(card.cancelSubscription).toHaveBeenCalledWith('preapproval_1');
  });

  it('falhar no gateway não prende o aluno no plano', async () => {
    const { service, card, subscriptions } = await comAssinaturaAtiva();
    card.cancelSubscription.mockRejectedValue(new Error('rede'));

    const cancelled = await service.cancelSubscription('aluno-1');

    expect(cancelled.status).toBe(SUBSCRIPTION_STATUS.CANCELLED);
    expect(subscriptions.store.get('aluno-1')!.status).toBe(
      SUBSCRIPTION_STATUS.CANCELLED,
    );
  });

  it('plano de PIX não tenta cancelar nada lá fora', async () => {
    const { service, card } = build();
    await service.choosePlan('aluno-1', PIX as any);

    await service.cancelSubscription('aluno-1');

    // Deixou de ser detalhe de implementação e virou regra de negócio: no PIX
    // não existe assinatura lá fora para encerrar.
    expect(card.cancelSubscription).not.toHaveBeenCalled();
  });

  it('criar a assinatura não confirma parcela: quem confirma é o webhook', async () => {
    const { service, subscriptions, card } = build();
    card.createCheckout.mockResolvedValue({
      id: 'preapproval_1',
      subscriptionId: 'preapproval_1',
      provider: 'MERCADOPAGO',
      outcome: 'PENDING',
    });
    await service.choosePlan('aluno-1', {
      ...CARTAO,
      acceptance: ACEITE,
    } as any);

    await service.payWithCard('aluno-1', CARTAO_TOKEN as any);

    // A primeira cobrança sai em até ~1h. Ativar aqui liberaria acesso antes
    // de existir dinheiro — e para sempre, se a cobrança falhar.
    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.gatewaySubscriptionId).toBe('preapproval_1');
    expect(saved.status).toBe(SUBSCRIPTION_STATUS.PENDING);
    expect(saved.paidInstallments).toBe(0);
  });

  it('cartão creditado na hora ativa o plano', async () => {
    const { service, subscriptions } = build();
    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.ANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);

    const result = await service.payWithCard('aluno-1', CARTAO_TOKEN as any);

    expect(result.outcome).toBe('PAID');
    expect(subscriptions.store.get('aluno-1')!.status).toBe(
      SUBSCRIPTION_STATUS.ACTIVE,
    );
  });

  it('desafio 3DS pendente não é sucesso', async () => {
    const { service, subscriptions, card } = build();
    card.createCheckout.mockResolvedValue({
      id: 'ORD01ABC',
      provider: 'MERCADOPAGO',
      outcome: 'CHALLENGE',
      challengeUrl: 'https://mp/challenge',
    });
    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.ANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);

    const result = await service.payWithCard('aluno-1', CARTAO_TOKEN as any);

    // Dar isto por concluído deixaria o aluno debitado, a tela dizendo
    // "concluído" e a cobrança nunca completando.
    expect(result.outcome).toBe('CHALLENGE');
    expect(result.challengeUrl).toBe('https://mp/challenge');
    expect(subscriptions.store.get('aluno-1')!.status).toBe(
      SUBSCRIPTION_STATUS.PENDING,
    );
  });

  it('cartão recusado volta como 400, não como plano ativo', async () => {
    const { service, card } = build();
    card.createCheckout.mockResolvedValue({
      id: 'ORD01ABC',
      provider: 'MERCADOPAGO',
      outcome: 'REJECTED',
      detail: 'rejected_by_issuer',
    });
    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.ANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);

    await expect(
      service.payWithCard('aluno-1', CARTAO_TOKEN as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('a renovação creditada confirma a próxima parcela e projeta mais uma', async () => {
    const { service, subscriptions } = await comAssinaturaAtiva();

    await service.handleMercadoPagoEvent(parcela('accredited') as any);

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.paidInstallments).toBe(1);
    expect(
      saved.charges.filter((charge) => charge.status !== CHARGE_STATUS.PAID),
    ).toHaveLength(6);
  });

  it('parcela processada com pagamento recusado NÃO confirma nada', async () => {
    const { service, subscriptions, users } = await comAssinaturaAtiva();

    // Depois da quarta tentativa recusada a parcela também fica `processed`.
    // Tratar os dois igual dá acesso vitalício de graça para quem nunca pagou.
    await service.handleMercadoPagoEvent(
      parcela('cc_rejected_other_reason') as any,
    );

    const saved = subscriptions.store.get('aluno-1')!;
    expect(saved.paidInstallments).toBe(0);
    expect(saved.status).toBe(SUBSCRIPTION_STATUS.PAST_DUE);
    expect(users.updateSubscriptionState).toHaveBeenCalledWith(
      'aluno-1',
      expect.objectContaining({ isPaying: false }),
    );
  });

  it('parcela sem pagamento associado também não confirma', async () => {
    const { service, subscriptions } = await comAssinaturaAtiva();

    await service.handleMercadoPagoEvent(parcela() as any);

    expect(subscriptions.store.get('aluno-1')!.paidInstallments).toBe(0);
  });

  it('assinatura cancelada pelo gateway cancela o plano sem cancelar de volta', async () => {
    const { service, subscriptions, card } = await comAssinaturaAtiva();

    // Chega sem ninguém pedir: 3 parcelas recusadas e o gateway cancela.
    await service.handleMercadoPagoEvent({
      topic: 'subscription_preapproval',
      id: 'preapproval_1',
      status: 'cancelled',
    } as any);

    expect(subscriptions.store.get('aluno-1')!.status).toBe(
      SUBSCRIPTION_STATUS.CANCELLED,
    );
    expect(card.cancelSubscription).not.toHaveBeenCalled();
  });

  it('assinatura ainda autorizada não cancela plano nenhum', async () => {
    const { service, subscriptions } = await comAssinaturaAtiva();

    await service.handleMercadoPagoEvent({
      topic: 'subscription_preapproval',
      id: 'preapproval_1',
      status: 'authorized',
    } as any);

    expect(subscriptions.store.get('aluno-1')!.status).toBe(
      SUBSCRIPTION_STATUS.ACTIVE,
    );
  });

  it('trocar cartão por PIX encerra a assinatura recorrente', async () => {
    const { service, card, subscriptions } = await comAssinaturaAtiva();

    await service.changePaymentMethod('aluno-1', {
      paymentMethod: PAYMENT_METHODS.PIX_RECURRING,
    });

    expect(card.cancelSubscription).toHaveBeenCalledWith('preapproval_1');
    // Sem isto o aluno pagaria nos dois trilhos no mês seguinte.
    expect(
      subscriptions.store.get('aluno-1')!.gatewaySubscriptionId,
    ).toBeUndefined();
  });
});

describe('SubscriptionService — simulação de pagamento', () => {
  it('fica trancada fora do DEV_MODE', async () => {
    const { service } = build();
    await service.choosePlan('aluno-1', PIX as any);

    await expect(service.mockPay('aluno-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('com DEV_MODE confirma a parcela e ativa o plano', async () => {
    const { service, pix, subscriptions } = build({
      config: {
        get: jest.fn((key: string) =>
          key === 'DEV_MODE' ? 'true' : 'segredo',
        ),
      },
    });
    await service.choosePlan('aluno-1', PIX as any);

    const result = await service.mockPay('aluno-1');

    expect(pix.simulatePayment).toHaveBeenCalledWith('pix_1');
    expect(result.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
    expect(subscriptions.store.get('aluno-1')!.paidInstallments).toBe(1);
  });
});

describe('SubscriptionService — validação de cupom (RF16)', () => {
  it('devolve desconto e duração de um cupom ativo', async () => {
    const { service, coupons } = build();
    coupons.findByCode.mockResolvedValue(
      new Coupon({
        id: 'c1',
        code: 'BEMVINDA',
        discountAmount: 50,
        durationMonths: 3,
        active: true,
        createdAt: '',
        createdBy: '',
      }),
    );

    await expect(service.validateCoupon('bemvinda')).resolves.toEqual({
      code: 'BEMVINDA',
      discountAmount: 50,
      durationMonths: 3,
    });
  });

  it('recusa código inexistente', async () => {
    const { service } = build();
    await expect(service.validateCoupon('NADA')).rejects.toThrow();
  });
});

describe('PIX em plano parcelado (spec 018)', () => {
  /** Contratação com plano e método escolhidos. */
  function contratar(plan: string, method: string) {
    const { service, users } = build();
    return service.choosePlan('aluno-1', {
      plan,
      paymentMethod: method,
      acceptance: ACEITE,
    } as any);
  }

  it('recusa PIX no semestral e no anual', async () => {
    for (const plan of [
      SUBSCRIPTION_PLANS.SEMIANNUAL,
      SUBSCRIPTION_PLANS.ANNUAL,
    ]) {
      await expect(
        contratar(plan, PAYMENT_METHODS.PIX_RECURRING),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        contratar(plan, PAYMENT_METHODS.PIX_RECURRING),
      ).rejects.toThrow(/cartão de crédito/i);
    }
  });

  it('mantém PIX no mensal', async () => {
    // O mensal não tem parcela futura: tem renovação, e quem não quiser
    // renovar simplesmente não paga o próximo QR (decisão nº 2 da spec).
    await expect(
      contratar(SUBSCRIPTION_PLANS.MONTHLY, PAYMENT_METHODS.PIX_RECURRING),
    ).resolves.toBeDefined();
  });

  it('aceita cartão em qualquer plano', async () => {
    for (const plan of Object.values(SUBSCRIPTION_PLANS)) {
      await expect(
        contratar(plan, PAYMENT_METHODS.CREDIT_CARD),
      ).resolves.toBeDefined();
    }
  });

  it('bloqueia também a troca de método depois de contratado', async () => {
    // Sem isto, bastava contratar o anual no cartão e trocar para PIX em
    // seguida — o bloqueio da tela de contratação não olha para esta rota.
    const { service } = build();
    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.ANNUAL,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);

    await expect(
      service.changePaymentMethod('aluno-1', {
        paymentMethod: PAYMENT_METHODS.PIX_RECURRING,
      } as any),
    ).rejects.toThrow(/cartão de crédito/i);
  });

  it('deixa trocar para PIX quando o plano é mensal', async () => {
    const { service } = build();
    await service.choosePlan('aluno-1', {
      plan: SUBSCRIPTION_PLANS.MONTHLY,
      paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
      acceptance: ACEITE,
    } as any);

    await expect(
      service.changePaymentMethod('aluno-1', {
        paymentMethod: PAYMENT_METHODS.PIX_RECURRING,
      } as any),
    ).resolves.toBeDefined();
  });
});
