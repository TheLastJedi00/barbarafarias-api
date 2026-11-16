import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRepository } from './subscription.repository';
import { CouponRepository } from './coupon.repository';
import { PlanAcceptanceRepository } from './plan-acceptance.repository';
import { MercadoPagoModule } from './mercadopago.module';
import { MercadoPagoWebhookController } from './mercadopago-webhook.controller';
import { PaymentAccessService } from './payment-access.service';
import { UserModule } from '../users/user.module';

/**
 * Cada método de pagamento entra pela sua porta abstrata, como o
 * `PayoutProvider` do fechamento das professoras: trocar de adquirente é
 * registrar outra classe aqui, sem tocar em service nem em controller.
 *
 * A spec 023 foi o primeiro teste real dessa decisão, e ela pagou — o
 * `subscription.service.ts` quase não mudou quando dois provedores viraram um.
 * As portas em si moram no `MercadoPagoModule` desde a spec 032, quando a loja
 * passou a cobrar também.
 */
@Module({
  imports: [ConfigModule, MercadoPagoModule, UserModule],
  controllers: [SubscriptionController, MercadoPagoWebhookController],
  providers: [
    SubscriptionService,
    SubscriptionRepository,
    CouponRepository,
    PlanAcceptanceRepository,
    PaymentAccessService,
  ],
  exports: [SubscriptionService, SubscriptionRepository, PaymentAccessService],
})
export class SubscriptionModule {}
