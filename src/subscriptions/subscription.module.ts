import { EnrollmentService } from '../enrollments/enrollment.service';
import { EnrollmentRepository } from '../enrollments/enrollment.repository';
import { EnrollmentController } from '../enrollments/enrollment.controller';
import { TurmaModule } from '../turmas/turma.module';
import { NotificationModule } from '../notifications/notification.module';
import { ContractModule } from '../contracts/contract.module';
import { Module } from '@nestjs/common';
import { PlanTierModule } from '../plan-tiers/plan-tier.module';
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
import { StoreModule } from '../store/store.module';

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
  // `StoreModule`: o webhook entrega à loja as orders que são dela (spec 032).
  // A loja não importa este módulo — só o `MercadoPagoModule` —, e é isso que
  // mantém a dependência numa direção só.
  imports: [
    ConfigModule,
    MercadoPagoModule,
    StoreModule,
    UserModule,
    PlanTierModule,
    ContractModule,
    TurmaModule,
    NotificationModule,
  ],
  controllers: [
    SubscriptionController,
    MercadoPagoWebhookController,
    // Spec 036: a matrícula mora em src/enrollments, mas é provida aqui — ela
    // vira assinatura na confirmação, e um módulo próprio criaria um ciclo
    // com este (o webhook daqui também a atende).
    EnrollmentController,
  ],
  providers: [
    SubscriptionService,
    EnrollmentService,
    EnrollmentRepository,
    SubscriptionRepository,
    CouponRepository,
    PlanAcceptanceRepository,
    PaymentAccessService,
  ],
  exports: [
    SubscriptionService,
    SubscriptionRepository,
    PaymentAccessService,
    PlanAcceptanceRepository,
    EnrollmentService,
    EnrollmentRepository,
  ],
})
export class SubscriptionModule {}
