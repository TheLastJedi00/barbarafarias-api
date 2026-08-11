import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRepository } from './subscription.repository';
import { CouponRepository } from './coupon.repository';
import { PlanAcceptanceRepository } from './plan-acceptance.repository';
import { CardGateway, PixGateway } from './payment.gateway';
import {
  MERCADOPAGO_CLIENT,
  MercadoPagoGateway,
  createMercadoPagoClients,
} from './mercadopago.gateway';
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
 */
@Module({
  imports: [ConfigModule, UserModule],
  controllers: [SubscriptionController, MercadoPagoWebhookController],
  providers: [
    SubscriptionService,
    SubscriptionRepository,
    CouponRepository,
    PlanAcceptanceRepository,
    PaymentAccessService,
    // Os clientes do Mercado Pago são construídos aqui, e não dentro do
    // gateway, para os testes poderem injetar um dublê sem tocar a rede.
    {
      provide: MERCADOPAGO_CLIENT,
      useFactory: createMercadoPagoClients,
      inject: [ConfigService],
    },
    MercadoPagoGateway,
    // **As duas portas apontam para a mesma instância**, e é a primeira vez
    // que isso acontece: o Mercado Pago faz PIX e cartão pela mesma conta.
    //
    // `useExisting`, e não `useClass`: o webhook injeta o `MercadoPagoGateway`
    // pelo nome da classe para conferir assinaturas, e duas instâncias teriam
    // dois clientes do SDK por processo.
    { provide: PixGateway, useExisting: MercadoPagoGateway },
    { provide: CardGateway, useExisting: MercadoPagoGateway },
  ],
  exports: [SubscriptionService, SubscriptionRepository, PaymentAccessService],
})
export class SubscriptionModule {}
