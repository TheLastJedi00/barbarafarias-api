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
    },
    webhooks: {
      constructEvent: jest
        .fn()
        .mockReturnValue({ id: 'evt_1', type: 'checkout.session.completed' }),
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
    get: jest.fn((key: string) =>
      key === 'APP_BASE_URL' ? 'https://app.example' : undefined,
    ),
  };
  const gateway = new StripeGateway(
    (overrides.client === null ? null : stripe) as any,
    users as any,
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
