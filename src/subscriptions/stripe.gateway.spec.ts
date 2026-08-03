import { StripeGateway } from './stripe.gateway';

/**
 * Stripe em memória: só os métodos que o gateway chama, cada um devolvendo o
 * mínimo que o código lê. Nenhum teste desta suíte toca a rede — é o mesmo
 * princípio do repositório falso do service.
 */
function fakeStripe() {
  return {
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_1' }),
    },
    products: {
      create: jest.fn().mockResolvedValue({ id: 'prod_1' }),
      retrieve: jest.fn().mockRejectedValue(new Error('No such product')),
    },
    prices: {
      create: jest.fn().mockResolvedValue({ id: 'price_1' }),
      list: jest.fn().mockResolvedValue({ data: [] }),
    },
    coupons: {
      create: jest.fn().mockResolvedValue({ id: 'bf-BEMVINDA-5000' }),
      retrieve: jest.fn().mockRejectedValue(new Error('No such coupon')),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test_1',
          client_secret: 'cs_test_1_secret',
        }),
      },
    },
    subscriptions: {
      cancel: jest.fn().mockResolvedValue({ id: 'sub_1' }),
      update: jest.fn().mockResolvedValue({ id: 'sub_1' }),
      retrieve: jest
        .fn()
        .mockResolvedValue({ id: 'sub_1', current_period_end: 1_780_000_000 }),
    },
    webhooks: {
      constructEvent: jest
        .fn()
        .mockReturnValue({ id: 'evt_1', type: 'checkout.session.completed' }),
    },
    v2: {
      core: {
        events: {
          retrieve: jest.fn().mockResolvedValue({
            id: 'evt_thin_1',
            type: 'v1.invoice.paid',
          }),
        },
      },
    },
  };
}

function fakeUsers() {
  return {
    findById: jest.fn().mockResolvedValue({
      id: 'aluno-1',
      fullName: 'Ana Aluna',
      email: 'ana@example.com',
      phone: '11999999999',
      cpf: '39053344705',
    }),
    setStripeCustomerId: jest.fn().mockResolvedValue(undefined),
  };
}

export function build(overrides: Record<string, any> = {}) {
  const stripe = overrides.stripe ?? fakeStripe();
  const users = overrides.users ?? fakeUsers();
  const config = {
    get: jest.fn((key: string): string | undefined =>
      key === 'APP_BASE_URL' ? 'https://app.example' : undefined,
    ),
  };
  const gateway = new StripeGateway(
    overrides.client === null ? null : stripe,
    users,
    config as any,
  );
  return { gateway, stripe, users, config };
}

const PEDIDO = {
  amount: 240,
  description: 'Plano Mensal — parcela 1',
  externalId: 'aluno-1-1-24000',
  customer: {
    email: 'ana@example.com',
    name: 'Ana Aluna',
    cellphone: '11999999999',
    taxId: '39053344705',
  },
  plan: 'MONTHLY',
  studentId: 'aluno-1',
};

describe('StripeGateway — configuração', () => {
  it('fica desligado sem chave, como o AbacatePay', () => {
    const { gateway } = build({ client: null });
    expect(gateway.isEnabled()).toBe(false);
  });

  it('liga quando o cliente foi construído', () => {
    const { gateway } = build();
    expect(gateway.isEnabled()).toBe(true);
  });

  it('sem chave, cobrar é erro explícito e não um `undefined` mais adiante', async () => {
    const { gateway } = build({ client: null });

    await expect(gateway.createCheckout(PEDIDO)).rejects.toThrow(
      /Stripe não configurado/,
    );
  });
});

describe('StripeGateway — pagador (Task 54)', () => {
  it('cadastra o aluno no Stripe e guarda o id no documento dele', async () => {
    const { gateway, stripe, users } = build();

    const id = await gateway.resolveCustomerId('aluno-1', PEDIDO.customer);

    expect(id).toBe('cus_1');
    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ana@example.com',
        name: 'Ana Aluna',
        metadata: { studentId: 'aluno-1' },
      }),
    );
    expect(users.setStripeCustomerId).toHaveBeenCalledWith('aluno-1', 'cus_1');
  });

  it('reusa o id gravado em vez de criar um cliente por contratação', async () => {
    const { gateway, stripe, users } = build();
    users.findById.mockResolvedValue({
      id: 'aluno-1',
      email: 'ana@example.com',
      stripeCustomerId: 'cus_ja_existe',
    });

    const id = await gateway.resolveCustomerId('aluno-1', PEDIDO.customer);

    expect(id).toBe('cus_ja_existe');
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });
});

describe('StripeGateway — catálogo (Task 54)', () => {
  it('cria um Product por plano e um Price mensal pelo valor da parcela', async () => {
    const { gateway, stripe } = build();

    const price = await gateway.resolvePriceId('MONTHLY', 'Plano Mensal', 240);

    expect(price).toBe('price_1');
    // Id determinístico em vez de `products.search`: a busca é eventualmente
    // consistente e devolveria vazio logo depois de criar, duplicando o
    // produto no painel.
    expect(stripe.products.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bf-plan-MONTHLY', name: 'Plano Mensal' }),
    );
    expect(stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        product: 'prod_1',
        currency: 'brl',
        unit_amount: 24000,
        recurring: { interval: 'month' },
        lookup_key: 'bf-MONTHLY-24000',
      }),
    );
  });

  it('reaproveita o Price quando o `lookup_key` já existe', async () => {
    const { gateway, stripe } = build();
    stripe.prices.list.mockResolvedValue({ data: [{ id: 'price_ja_existe' }] });

    const price = await gateway.resolvePriceId('MONTHLY', 'Plano Mensal', 240);

    expect(price).toBe('price_ja_existe');
    expect(stripe.prices.create).not.toHaveBeenCalled();
  });

  it('o valor entra na chave: cupom muda a parcela e Price tem preço fixo', async () => {
    const { gateway, stripe } = build();

    await gateway.resolvePriceId('MONTHLY', 'Plano Mensal', 190);

    expect(stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({ lookup_key: 'bf-MONTHLY-19000' }),
    );
  });

  it('consulta a API uma vez só por chave, memoizando o resultado', async () => {
    const { gateway, stripe } = build();

    await gateway.resolvePriceId('MONTHLY', 'Plano Mensal', 240);
    await gateway.resolvePriceId('MONTHLY', 'Plano Mensal', 240);

    expect(stripe.prices.create).toHaveBeenCalledTimes(1);
    expect(stripe.prices.list).toHaveBeenCalledTimes(1);
  });
});

describe('StripeGateway — cupons (Task 55)', () => {
  const TRES_MESES = {
    code: 'BEMVINDA',
    amountOff: 50,
    durationMonths: 3,
  };

  it('cupom com duração vira `repeating` com os mesmos meses', async () => {
    const { gateway, stripe } = build();

    const id = await gateway.resolveCouponId(TRES_MESES);

    expect(id).toBe('bf-BEMVINDA-5000');
    expect(stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bf-BEMVINDA-5000',
        amount_off: 5000,
        currency: 'brl',
        duration: 'repeating',
        duration_in_months: 3,
      }),
    );
  });

  it('cupom vitalício vira `forever`, sem contagem de meses', async () => {
    const { gateway, stripe } = build();

    await gateway.resolveCouponId({ ...TRES_MESES, durationMonths: null });

    const [payload] = stripe.coupons.create.mock.calls[0];
    expect(payload.duration).toBe('forever');
    expect(payload.duration_in_months).toBeUndefined();
  });

  it('reusa o cupom que já existe em vez de recriar', async () => {
    const { gateway, stripe } = build();
    stripe.coupons.retrieve.mockResolvedValue({ id: 'bf-BEMVINDA-5000' });

    const id = await gateway.resolveCouponId(TRES_MESES);

    expect(id).toBe('bf-BEMVINDA-5000');
    expect(stripe.coupons.create).not.toHaveBeenCalled();
  });

  it('o desconto entra no id: mudar o valor do cupom não reusa o antigo', async () => {
    const { gateway, stripe } = build();

    await gateway.resolveCouponId({ ...TRES_MESES, amountOff: 80 });

    expect(stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bf-BEMVINDA-8000', amount_off: 8000 }),
    );
  });
});

describe('StripeGateway — checkout incorporado (Task 56)', () => {
  /** Payload da única chamada a `checkout.sessions.create`. */
  async function checkout(request: Record<string, any> = {}) {
    const { gateway, stripe } = build();
    const result = await gateway.createCheckout({
      ...PEDIDO,
      ...request,
    } as any);
    return {
      result,
      payload: stripe.checkout.sessions.create.mock.calls[0][0],
    };
  }

  it('devolve o segredo da sessão, não uma URL para redirecionar', async () => {
    const { result, payload } = await checkout();

    expect(result).toEqual({
      id: 'cs_test_1',
      clientSecret: 'cs_test_1_secret',
      provider: 'STRIPE',
    });
    expect(payload.ui_mode).toBe('embedded_page');
    expect(payload.mode).toBe('subscription');
  });

  it('NUNCA manda `payment_method_types` — quem decide os métodos é o painel', async () => {
    const { payload } = await checkout();

    expect(payload).not.toHaveProperty('payment_method_types');
  });

  it('cobra o Price do plano no cliente cadastrado', async () => {
    const { payload } = await checkout();

    expect(payload.customer).toBe('cus_1');
    expect(payload.line_items).toEqual([{ price: 'price_1', quantity: 1 }]);
  });

  it('volta para "Meu Plano" com o id da sessão, para a tela reconsultar', async () => {
    const { payload } = await checkout();

    expect(payload.return_url).toBe(
      'https://app.example/meu-plano?pagamento=concluido&session_id={CHECKOUT_SESSION_ID}',
    );
  });

  it('carrega no metadata o que o webhook precisa para achar a parcela', async () => {
    const { payload } = await checkout({ chargeIndex: 3 });

    expect(payload.subscription_data.metadata).toMatchObject({
      studentId: 'aluno-1',
      plan: 'MONTHLY',
      chargeIndex: '3',
    });
  });

  it('plano sem fim não anuncia ciclos; plano finito anuncia quantos são', async () => {
    const semFim = await checkout({ recurring: { cycles: null } });
    expect(semFim.payload.subscription_data.metadata.cycles).toBeUndefined();

    const semestral = await checkout({
      plan: 'SEMIANNUAL',
      recurring: { cycles: 6 },
    });
    expect(semestral.payload.subscription_data.metadata.cycles).toBe('6');
  });

  it('aplica o cupom como desconto do Stripe, não como valor já abatido', async () => {
    const { payload } = await checkout({
      coupon: { code: 'BEMVINDA', amountOff: 50, durationMonths: 3 },
    });

    expect(payload.discounts).toEqual([{ coupon: 'bf-BEMVINDA-5000' }]);
  });

  it('sem cupom não manda `discounts` vazio, que o Stripe recusaria', async () => {
    const { payload } = await checkout();

    expect(payload).not.toHaveProperty('discounts');
  });

  it('identifica a integração para o painel comparar os fluxos', async () => {
    const { payload } = await checkout();

    expect(payload.integration_identifier).toMatch(/^bf-assinatura-[a-z]{8}$/);
  });
});

describe('StripeGateway — ciclo de vida (Task 57)', () => {
  it('cancela a assinatura no Stripe', async () => {
    const { gateway, stripe } = build();

    await gateway.cancelSubscription('sub_1');

    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_1');
  });

  it('assinatura já cancelada não é erro: tela e webhook chegam fora de ordem', async () => {
    const { gateway, stripe } = build();
    stripe.subscriptions.cancel.mockRejectedValue(
      Object.assign(new Error('No such subscription'), {
        code: 'resource_missing',
      }),
    );

    await expect(
      gateway.cancelSubscription('sub_sumiu'),
    ).resolves.toBeUndefined();
  });

  it('um erro de verdade continua estourando', async () => {
    const { gateway, stripe } = build();
    stripe.subscriptions.cancel.mockRejectedValue(new Error('Invalid API Key'));

    await expect(gateway.cancelSubscription('sub_1')).rejects.toThrow(
      /Invalid API Key/,
    );
  });

  it('fecha o plano finito no fim do último ciclo contratado', async () => {
    const { gateway, stripe } = build();
    // 2026-06-01T00:00:00Z
    stripe.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_1',
      start_date: Date.UTC(2026, 5, 1) / 1000,
    });

    await gateway.capSubscriptionCycles('sub_1', 6);

    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', {
      cancel_at: Date.UTC(2026, 11, 1) / 1000,
    });
  });
});

describe('StripeGateway — verificação de eventos (Task 57)', () => {
  const CORPO = Buffer.from('{"id":"evt_1"}');

  it('evento instantâneo é verificado com a chave do endpoint instantâneo', async () => {
    const { gateway, stripe, config } = build();
    config.get.mockImplementation((key: string) =>
      key === 'STRIPE_WEBHOOK_SECRET_SNAPSHOT' ? 'whsec_snapshot' : undefined,
    );
    stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_1' } },
    });

    const event = await gateway.verifySnapshotEvent(CORPO, 'assinatura');

    expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
      CORPO,
      'assinatura',
      'whsec_snapshot',
    );
    expect(event).toEqual({
      id: 'evt_1',
      type: 'checkout.session.completed',
      object: { id: 'cs_test_1' },
    });
  });

  it('evento mínimo traz só o id: o objeto é buscado na API', async () => {
    const { gateway, stripe, config } = build();
    config.get.mockImplementation((key: string) =>
      key === 'STRIPE_WEBHOOK_SECRET_THIN' ? 'whsec_thin' : undefined,
    );
    const parse = jest
      .fn()
      .mockReturnValue({ id: 'evt_thin_1', type: 'v1.invoice.paid' });
    stripe.parseEventNotification = parse;
    stripe.v2.core.events.retrieve.mockResolvedValue({
      id: 'evt_thin_1',
      type: 'v1.invoice.paid',
      fetchRelatedObject: jest.fn().mockResolvedValue({ id: 'in_1' }),
    });

    const event = await gateway.verifyThinEvent(CORPO, 'assinatura');

    expect(parse).toHaveBeenCalledWith(CORPO, 'assinatura', 'whsec_thin');
    expect(event).toEqual({
      id: 'evt_thin_1',
      // O prefixo `v1.` some para o handler de domínio não precisar saber por
      // qual endpoint o evento entrou.
      type: 'invoice.paid',
      object: { id: 'in_1' },
    });
  });

  it('sem a chave do endpoint, o evento é recusado em vez de aceito às cegas', async () => {
    const { gateway } = build();

    await expect(gateway.verifySnapshotEvent(CORPO, 'x')).rejects.toThrow(
      /STRIPE_WEBHOOK_SECRET_SNAPSHOT/,
    );
  });
});
