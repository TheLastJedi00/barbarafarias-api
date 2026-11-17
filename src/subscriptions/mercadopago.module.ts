import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CardGateway, PixGateway } from './payment.gateway';
import {
  MERCADOPAGO_CLIENT,
  MercadoPagoGateway,
  createMercadoPagoClients,
} from './mercadopago.gateway';

/**
 * O Mercado Pago num módulo só dele (spec 032). Até aqui ele morava dentro do
 * `SubscriptionModule`, que era o único a cobrar. A loja também cobra, e o
 * webhook — que é um só, configurado no painel — precisa entregar a order a
 * quem for dono dela. Com o gateway aqui, assinatura e loja o importam sem uma
 * depender da outra para chegar até ele.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    // Os clientes do Mercado Pago são construídos aqui, e não dentro do
    // gateway, para os testes poderem injetar um dublê sem tocar a rede.
    {
      provide: MERCADOPAGO_CLIENT,
      useFactory: createMercadoPagoClients,
      inject: [ConfigService],
    },
    MercadoPagoGateway,
    // **As duas portas apontam para a mesma instância**: o Mercado Pago faz
    // PIX e cartão pela mesma conta.
    //
    // `useExisting`, e não `useClass`: o webhook injeta o `MercadoPagoGateway`
    // pelo nome da classe para conferir assinaturas, e duas instâncias teriam
    // dois clientes do SDK por processo.
    { provide: PixGateway, useExisting: MercadoPagoGateway },
    { provide: CardGateway, useExisting: MercadoPagoGateway },
  ],
  exports: [MercadoPagoGateway, PixGateway, CardGateway],
})
export class MercadoPagoModule {}
