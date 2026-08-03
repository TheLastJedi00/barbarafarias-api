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
  controllers: [SubscriptionController, SubscriptionWebhookController],
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
    { provide: CardGateway, useClass: AbacatePayCardGateway },
  ],
  exports: [SubscriptionService, SubscriptionRepository, PaymentAccessService],
})
export class SubscriptionModule {}
