import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionModule } from './subscription.module';
import { CardGateway, PixGateway } from './payment.gateway';
import { StripeGateway } from './stripe.gateway';
import { FIRESTORE } from '../firestore/firestore.module';

/** Firestore de mentira, global como o de verdade, mas sem credencial. */
@Global()
@Module({
  providers: [{ provide: FIRESTORE, useValue: { collection: () => ({}) } }],
  exports: [FIRESTORE],
})
class FakeFirestoreModule {}

/**
 * O container resolve as duas portas e o webhook?
 *
 * Compilar não prova isso: um `useExisting` apontando para um provider não
 * registrado passa no `tsc` e só quebra no boot — que em produção é o deploy
 * inteiro caindo, com a fila de webhooks do Stripe acumulando atrás.
 */
describe('SubscriptionModule — fiação', () => {
  it('entrega o Stripe no cartão e o AbacatePay no PIX, na mesma instância', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        FakeFirestoreModule,
        SubscriptionModule,
      ],
    }).compile();

    const card = moduleRef.get(CardGateway);
    const pix = moduleRef.get(PixGateway);

    expect(card).toBeInstanceOf(StripeGateway);
    // Duas instâncias seriam dois caches de catálogo, e o dobro de chamadas à
    // API por processo — o webhook injeta o gateway pelo nome da classe.
    expect(card).toBe(moduleRef.get(StripeGateway));
    expect(pix).not.toBe(card);
  });
});
