import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  SubscriptionController,
  SubscriptionWebhookController,
} from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRepository } from './subscription.repository';
import { CouponRepository } from './coupon.repository';
import {
  AbacatePayCardGateway,
  AbacatePayGateway,
  CardGateway,
  PixGateway,
} from './payment.gateway';
import {
  STRIPE_CLIENT,
  StripeGateway,
  createStripeClient,
} from './stripe.gateway';
import { StripeWebhookController } from './stripe-webhook.controller';
import { PaymentAccessService } from './payment-access.service';
import { UserModule } from '../users/user.module';

/**
 * Cada método de pagamento entra pela sua porta abstrata, como o
 * `PayoutProvider` do fechamento das professoras: trocar de adquirente é
 * registrar outra classe aqui, sem tocar em service nem em controller. Desde a
 * spec 014 são duas portas — PIX no AbacatePay, cartão no Stripe.
 */
@Module({
  imports: [ConfigModule, UserModule],
  controllers: [
    SubscriptionController,
    SubscriptionWebhookController,
    StripeWebhookController,
  ],
  providers: [
    SubscriptionService,
    SubscriptionRepository,
    CouponRepository,
    PaymentAccessService,
    AbacatePayGateway,
    { provide: PixGateway, useExisting: AbacatePayGateway },
    // O cliente do Stripe é construído aqui, e não dentro do gateway, para os
    // testes poderem injetar um dublê sem tocar a rede.
    {
      provide: STRIPE_CLIENT,
      useFactory: createStripeClient,
      inject: [ConfigService],
    },
    StripeGateway,
    // O cartão é do Stripe desde a spec 014. O `AbacatePayCardGateway` fica
    // registrado e sem uso: é o caminho de volta se a conta do Stripe ficar
    // indisponível, e trocar de volta é editar a linha abaixo.
    AbacatePayCardGateway,
    // `useExisting`, e não `useClass`: o webhook injeta o `StripeGateway` pelo
    // nome da classe para verificar assinaturas, e duas instâncias teriam dois
    // caches de catálogo — o dobro de chamadas à API por processo.
    { provide: CardGateway, useExisting: StripeGateway },
  ],
  exports: [SubscriptionService, SubscriptionRepository, PaymentAccessService],
})
export class SubscriptionModule {}
