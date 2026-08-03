import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { UserRepository } from '../users/user.repository';
import { CardGateway, CheckoutRequest, CheckoutResult } from './payment.gateway';

/**
 * Token do cliente do Stripe. O cliente é construído pelo módulo, não pelo
 * gateway, para os testes poderem injetar um dublê — nenhuma suíte deste
 * projeto deve depender de rede (`stripe.gateway.spec.ts`).
 *
 * `null` quando não há chave configurada.
 */
export const STRIPE_CLIENT = 'STRIPE_CLIENT';

/**
 * Versão da API fixada explicitamente. O SDK já traria esta mesma versão por
 * padrão, mas escrevê-la aqui é o que impede uma atualização de dependência de
 * mudar o formato de resposta sem ninguém decidir isso.
 */
export const STRIPE_API_VERSION = '2026-07-29.dahlia';

/**
 * Cartão de crédito pelo Stripe (spec 014).
 *
 * O desenho é o mesmo do `AbacatePayGateway`: a ausência de chave não derruba a
 * aplicação — o aluno vê o plano gravado com um aviso de cobrança indisponível
 * em vez de um 500 sem explicação.
 *
 * Duas regras da spec valem para tudo aqui dentro:
 *
 * 1. **Nunca** mandar `payment_method_types`. Quem decide os métodos aceitos é
 *    o painel do Stripe; fixar no código congelaria o cartão e desligaria os
 *    outros métodos que aumentam conversão.
 * 2. Nenhum dado cru de cartão (PAN, CVC) passa por aqui. O formulário é do
 *    Stripe, e o backend só troca ids e segredos de sessão.
 */
@Injectable()
export class StripeGateway extends CardGateway {
  private readonly logger = new Logger(StripeGateway.name);
  private readonly appBaseUrl: string;

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly users: UserRepository,
    private readonly configService: ConfigService,
  ) {
    super();
    this.appBaseUrl =
      this.configService.get<string>('APP_BASE_URL') ?? 'http://localhost:4200';

    if (!this.stripe) {
      this.logger.warn(
        'STRIPE_SECRET_KEY ausente: cobranças de cartão não serão emitidas.',
      );
    }
  }

  isEnabled(): boolean {
    return !!this.stripe;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createCheckout(_request: CheckoutRequest): Promise<CheckoutResult> {
    this.require();
    throw new Error('createCheckout chega na Task 56');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async cancelSubscription(_subscriptionId: string): Promise<void> {
    this.require();
    throw new Error('cancelSubscription chega na Task 57');
  }

  /**
   * O cliente ou um erro nomeado. Sem isto a chave ausente viraria um
   * `TypeError: Cannot read properties of null` lá adiante, longe da causa.
   */
  private require(): Stripe {
    if (!this.stripe) throw new Error('Stripe não configurado');
    return this.stripe;
  }
}

/** Constrói o cliente do Stripe, ou `null` quando não há chave. */
export function createStripeClient(config: ConfigService): Stripe | null {
  const key = config.get<string>('STRIPE_SECRET_KEY');
  if (!key) return null;
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}
