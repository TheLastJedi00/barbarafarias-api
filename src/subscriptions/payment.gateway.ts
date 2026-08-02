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
    const payload = {
      amount: toCents(request.amount),
      description: request.description,
      expiresIn: PIX_EXPIRATION_SECONDS,
      customer: request.customer,
    };

    try {
      const data = await this.abacateFetch('/pixQrCode/create', payload);
      if (!data || !data.id || !data.brCode) {
        throw new Error(`Resposta incompleta: ${JSON.stringify(data)}`);
      }
      return {
        id: data.id,
        brCode: data.brCode,
        brCodeBase64: data.brCodeBase64,
      };
    } catch (error: any) {
      throw new Error(`AbacatePay não devolveu o QR Code: ${error.message}`);
    }
  }

  async createCheckout(request: ChargeRequest): Promise<CheckoutResult> {
    const returnUrl = `${this.appBaseUrl}/meu-plano`;
    const payload = {
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
    };

    try {
      const data = await this.abacateFetch('/billing/create', payload);
      if (!data || !data.id || !data.url) {
        throw new Error(`Resposta incompleta: ${JSON.stringify(data)}`);
      }
      return { id: data.id, url: data.url };
    } catch (error: any) {
      throw new Error(`AbacatePay não devolveu o checkout: ${error.message}`);
    }
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

  private async abacateFetch(path: string, body: any): Promise<any> {
    const apiKey = this.configService.get<string>('ABACATEPAY_API_KEY');
    if (!apiKey) throw new Error('AbacatePay não configurado');

    const res = await fetch(`https://api.abacatepay.com/v1${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'fariasbarbara-api',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const errorMsg = data?.error || data?.message || JSON.stringify(data) || res.statusText;
      throw new Error(errorMsg);
    }

    return data?.data || data;
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
