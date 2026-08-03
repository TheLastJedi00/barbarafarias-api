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
      search: jest.fn().mockResolvedValue({ data: [] }),
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

    await expect(
      gateway.createCheckout({
        amount: 240,
        description: 'Plano Mensal — parcela 1',
        externalId: 'aluno-1-1-24000',
        customer: { email: 'ana@example.com' },
        plan: 'MONTHLY',
      }),
    ).rejects.toThrow(/Stripe não configurado/);
  });
});
