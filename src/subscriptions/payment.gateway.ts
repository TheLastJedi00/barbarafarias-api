import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import AbacatePay from 'abacatepay-nodejs-sdk';

/** Quem vai pagar. Só o e-mail é exigido pelo gateway. */
export interface GatewayCustomer {
  name?: string;
  email: string;
  cellphone?: string;
  taxId?: string;
}

export interface ChargeRequest {
  /** Valor em **reais**. A conversão para centavos é feita aqui dentro. */
  amount: number;
  description: string;
  /** Id da cobrança no nosso lado, para reconciliar depois. */
  externalId: string;
  customer: GatewayCustomer;
}

export interface PixChargeResult {
  id: string;
  /** Código copia-e-cola. */
  brCode: string;
  /** QR Code em base64 (data URI pronta para `<img src>`). */
  brCodeBase64: string;
}

export interface CheckoutResult {
  id: string;
  url: string;
}

/**
 * Porta de cobrança do aluno. Existe pelo mesmo motivo do `PayoutProvider` do
 * fechamento das professoras: a regra de negócio (cronograma, cupom, status)
 * não deve saber qual gateway está do outro lado, e os testes não devem
 * precisar de rede.
 */
export abstract class PaymentGateway {
  /** `false` quando não há chave configurada — o plano nasce sem cobrança. */
  abstract isEnabled(): boolean;
  abstract createPixCharge(request: ChargeRequest): Promise<PixChargeResult>;
  abstract createCheckout(request: ChargeRequest): Promise<CheckoutResult>;
  /** Simula a confirmação do PIX no ambiente de testes do gateway. */
  abstract simulatePayment(chargeId: string): Promise<boolean>;
}

/** R$ → centavos, que é a unidade da API do AbacatePay. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

@Injectable()
export class AbacatePayGateway extends PaymentGateway {
  private readonly logger = new Logger(AbacatePayGateway.name);
  private readonly client?: ReturnType<typeof AbacatePay>;
  private readonly appBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    super();
    const apiKey = this.configService.get<string>('ABACATEPAY_API_KEY');
    this.appBaseUrl =
      this.configService.get<string>('APP_BASE_URL') ?? 'http://localhost:4200';

    if (apiKey) {
      this.client = AbacatePay(apiKey);
    } else {
      // Mesma postura do ResendService: a ausência da chave não derruba a
      // aplicação. O aluno vê o plano escolhido e um aviso de que a cobrança
      // não pôde ser emitida, em vez de um 500 sem explicação.
      this.logger.warn(
        'ABACATEPAY_API_KEY ausente: cobranças não serão emitidas.',
      );
    }
  }

  isEnabled(): boolean {
    return !!this.client;
  }

  async createPixCharge(request: ChargeRequest): Promise<PixChargeResult> {
    const response = await this.requireClient().pixQrCode.create({
      amount: toCents(request.amount),
      description: request.description,
      expiresIn: PIX_EXPIRATION_SECONDS,
      customer: request.customer,
    });

    if (response.error || !('data' in response) || !response.data) {
      throw new Error(response.error ?? 'AbacatePay não devolveu o QR Code');
    }

    return {
      id: response.data.id,
      brCode: response.data.brCode,
      brCodeBase64: response.data.brCodeBase64,
    };
  }

  async createCheckout(request: ChargeRequest): Promise<CheckoutResult> {
    const returnUrl = `${this.appBaseUrl}/meu-plano`;
    // `methods` fica em PIX porque é o único valor que a API aceita hoje
    // ("Atualmente, apenas PIX é suportado", diz a própria SDK). A página de
    // checkout do AbacatePay é quem oferece ao aluno as formas habilitadas na
    // loja — inclusive cartão. Quando a API liberar 'CARD', é só somar aqui.
    const response = await this.requireClient().billing.create({
      frequency: 'ONE_TIME',
      methods: ['PIX'],
      products: [
        {
          externalId: request.externalId,
          name: request.description,
          quantity: 1,
          price: toCents(request.amount),
        },
      ],
      returnUrl,
      completionUrl: `${returnUrl}?pagamento=concluido`,
      customer: request.customer,
    });

    if (response.error || !response.data) {
      throw new Error(response.error ?? 'AbacatePay não devolveu o checkout');
    }

    return { id: response.data.id, url: response.data.url };
  }

  async simulatePayment(chargeId: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      const response = await this.client.pixQrCode.simulatePayment({
        id: chargeId,
      });
      return !response.error;
    } catch (error) {
      this.logger.warn(
        `Falha ao simular pagamento de ${chargeId}: ${String(error)}`,
      );
      return false;
    }
  }

  private requireClient(): ReturnType<typeof AbacatePay> {
    if (!this.client) {
      throw new Error('AbacatePay não configurado');
    }
    return this.client;
  }
}

/** Uma hora para pagar o PIX antes de o QR Code expirar. */
export const PIX_EXPIRATION_SECONDS = 3600;
