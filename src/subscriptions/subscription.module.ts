import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
    { provide: CardGateway, useClass: AbacatePayCardGateway },
  ],
  exports: [SubscriptionService, SubscriptionRepository, PaymentAccessService],
})
export class SubscriptionModule {}
