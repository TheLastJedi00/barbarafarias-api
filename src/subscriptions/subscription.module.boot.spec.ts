import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionModule } from './subscription.module';
import { CardGateway, PixGateway } from './payment.gateway';
import { MercadoPagoGateway } from './mercadopago.gateway';
import { FIRESTORE } from '../firestore/firestore.module';
import { FIREBASE_AUTH } from '../firestore/firebase-auth.module';

/**
 * Firestore e Firebase Auth de mentira, globais como os de verdade, mas sem
 * credencial: instanciar os reais aqui exigiria a service account.
 */
@Global()
@Module({
  providers: [
    { provide: FIRESTORE, useValue: { collection: () => ({}) } },
    { provide: FIREBASE_AUTH, useValue: {} },
  ],
  exports: [FIRESTORE, FIREBASE_AUTH],
})
class FakeFirestoreModule {}

/**
 * O container resolve as duas portas e o webhook?
 *
 * Compilar não prova isso: um `useExisting` apontando para um provider não
 * registrado passa no `tsc` e só quebra no boot — que em produção é o deploy
 * inteiro caindo, com a fila de webhooks do gateway acumulando atrás.
 */
describe('SubscriptionModule — fiação', () => {
  it('entrega o mesmo Mercado Pago nas duas portas', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        FakeFirestoreModule,
        SubscriptionModule,
      ],
    }).compile();

    const card = moduleRef.get(CardGateway);
    const pix = moduleRef.get(PixGateway);

    expect(card).toBeInstanceOf(MercadoPagoGateway);
    // **A mesma instância nas duas portas.** Duas seriam dois clientes do SDK
    // por processo, e o webhook injeta o gateway pelo nome da classe.
    expect(card).toBe(moduleRef.get(MercadoPagoGateway));
    expect(pix).toBe(card);
  });

  it('sobe sem chave nenhuma, com o gateway desligado', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        FakeFirestoreModule,
        SubscriptionModule,
      ],
    }).compile();

    // Chave ausente derruba `isEnabled()`, não o boot: o aluno vê o plano
    // gravado com um aviso, em vez de um 500 sem explicação.
    expect(moduleRef.get(CardGateway).isEnabled()).toBe(false);
  });
});
