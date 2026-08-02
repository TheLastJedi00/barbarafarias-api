import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  SubscriptionController,
  SubscriptionWebhookController,
} from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRepository } from './subscription.repository';
import { CouponRepository } from './coupon.repository';
import { AbacatePayGateway, PaymentGateway } from './payment.gateway';
import { PaymentAccessService } from './payment-access.service';
import { UserModule } from '../users/user.module';

/**
 * O gateway entra pela porta abstrata (`PaymentGateway`), como o
 * `PayoutProvider` do fechamento das professoras: trocar de adquirente é
 * registrar outra classe aqui, sem tocar em service nem em controller.
 */
@Module({
  imports: [ConfigModule, UserModule],
  controllers: [SubscriptionController, SubscriptionWebhookController],
  providers: [
    SubscriptionService,
    SubscriptionRepository,
    CouponRepository,
    PaymentAccessService,
    { provide: PaymentGateway, useClass: AbacatePayGateway },
  ],
  exports: [SubscriptionService, SubscriptionRepository, PaymentAccessService],
})
export class SubscriptionModule {}
