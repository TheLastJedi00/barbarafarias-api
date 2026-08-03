import { SubscriptionRepository } from './subscription.repository';
import { Subscription } from './subscription.entity';
import { CHARGE_STATUS, SUBSCRIPTION_STATUS } from './subscription.entity';
import { GATEWAY_PROVIDERS } from './payment.gateway';

/**
 * Firestore em memória com a superfície que o repositório usa: `doc().get`,
 * `doc().set`, `doc().delete` e a leitura da coleção inteira.
 *
 * O que justifica o fake é a Task 51: a tradução entre o campo antigo
 * (`abacatePayId`) e o novo (`gatewayChargeId`) mora aqui, e errar nela não
 * aparece em teste manual com aluno novo — só quebra o webhook de quem
 * contratou antes do deploy.
 */
function makeDb() {
  const store = new Map<string, Record<string, any>>();

  const ref = (collection: string, id: string) => ({
    async get() {
      const data = store.get(`${collection}/${id}`);
      return { exists: data !== undefined, id, data: () => data };
    },
    async set(data: Record<string, any>) {
      store.set(`${collection}/${id}`, data);
    },
    async delete() {
      store.delete(`${collection}/${id}`);
    },
  });

  return {
    store,
    collection: (name: string) => ({
      doc: (id: string) => ref(name, id),
      where() {
        throw new Error('não usado neste teste');
      },
      async get() {
        return {
          docs: [...store.entries()]
            .filter(([key]) => key.startsWith(`${name}/`))
            .map(([key, data]) => ({
              id: key.slice(name.length + 1),
              data: () => data,
            })),
        };
      },
    }),
  };
}

function build() {
  const db = makeDb();
  return { db, repository: new SubscriptionRepository(db as any) };
}

/** Documento como o gravado antes da spec 014: só `abacatePayId`. */
function legacyDocument(chargeId: string) {
  return {
    studentId: 'aluno-antigo',
    plan: 'MONTHLY',
    status: SUBSCRIPTION_STATUS.PENDING,
    paymentMethod: 'PIX_RECURRING',
    charges: [
      {
        index: 1,
        dueDate: '2026-08-01',
        amount: 240,
        status: CHARGE_STATUS.PENDING,
        abacatePayId: chargeId,
      },
    ],
  };
}

function subscriptionWith(charge: Record<string, any>): Subscription {
  return new Subscription({
    id: 'aluno-1',
    studentId: 'aluno-1',
    plan: 'MONTHLY' as any,
    status: SUBSCRIPTION_STATUS.PENDING,
    paymentMethod: 'CREDIT_CARD' as any,
    totalAmount: 240,
    installments: 1,
    installmentAmount: 240,
    paidInstallments: 0,
    startDate: '2026-08-01',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    charges: [
      {
        index: 1,
        dueDate: '2026-08-01',
        amount: 240,
        status: CHARGE_STATUS.PENDING,
        ...charge,
      } as any,
    ],
  });
}

describe('SubscriptionRepository — id de cobrança neutro (Task 51)', () => {
  it('lê o campo antigo como `gatewayChargeId` e assume o AbacatePay', async () => {
    const { db, repository } = build();
    db.store.set('subscriptions/aluno-antigo', legacyDocument('pix_legado'));

    const found = await repository.findByStudent('aluno-antigo');

    expect(found!.charges[0].gatewayChargeId).toBe('pix_legado');
    expect(found!.charges[0].gatewayProvider).toBe(
      GATEWAY_PROVIDERS.ABACATEPAY,
    );
  });

  it('o campo novo tem precedência sobre o antigo', async () => {
    const { db, repository } = build();
    db.store.set('subscriptions/aluno-antigo', {
      ...legacyDocument('pix_legado'),
      charges: [
        {
          index: 1,
          dueDate: '2026-08-01',
          amount: 240,
          status: CHARGE_STATUS.PENDING,
          abacatePayId: 'pix_legado',
          gatewayChargeId: 'cs_novo',
          gatewayProvider: GATEWAY_PROVIDERS.STRIPE,
        },
      ],
    });

    const found = await repository.findByStudent('aluno-antigo');

    expect(found!.charges[0].gatewayChargeId).toBe('cs_novo');
    expect(found!.charges[0].gatewayProvider).toBe(GATEWAY_PROVIDERS.STRIPE);
  });

  it('espelha a cobrança do AbacatePay no campo antigo, para sobreviver a um rollback', async () => {
    const { db, repository } = build();

    await repository.save(
      subscriptionWith({
        gatewayChargeId: 'pix_novo',
        gatewayProvider: GATEWAY_PROVIDERS.ABACATEPAY,
      }),
    );

    const [charge] = db.store.get('subscriptions/aluno-1')!.charges;
    expect(charge.gatewayChargeId).toBe('pix_novo');
    expect(charge.abacatePayId).toBe('pix_novo');
  });

  it('não espelha a sessão do Stripe: o código antigo não saberia o que fazer com ela', async () => {
    const { db, repository } = build();

    await repository.save(
      subscriptionWith({
        gatewayChargeId: 'cs_test_123',
        gatewayProvider: GATEWAY_PROVIDERS.STRIPE,
      }),
    );

    const [charge] = db.store.get('subscriptions/aluno-1')!.charges;
    expect(charge.gatewayChargeId).toBe('cs_test_123');
    expect(charge.abacatePayId).toBeNull();
  });

  it('o webhook acha a assinatura pelos dois campos', async () => {
    const { db, repository } = build();
    db.store.set('subscriptions/aluno-antigo', legacyDocument('pix_legado'));
    await repository.save(
      subscriptionWith({
        gatewayChargeId: 'cs_test_123',
        gatewayProvider: GATEWAY_PROVIDERS.STRIPE,
      }),
    );

    await expect(repository.findByChargeId('pix_legado')).resolves.toMatchObject(
      { studentId: 'aluno-antigo' },
    );
    await expect(repository.findByChargeId('cs_test_123')).resolves.toMatchObject(
      { studentId: 'aluno-1' },
    );
    await expect(repository.findByChargeId('nao_existe')).resolves.toBeNull();
  });
});
