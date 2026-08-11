import { Injectable, Logger } from '@nestjs/common';

export interface PayoutRequest {
  teacherId: string;
  teacherName: string;
  pixKey?: string;
  amount: number;
  reference: string; // ex.: '2026-08'
}

export interface PayoutResult {
  provider: string;
  status: 'manual' | 'sent' | 'failed';
  message: string;
}

/**
 * Porta de pagamento. Hoje o PIX é manual; automatizá-lo é implementar
 * esta interface e registrar o outro provider no módulo — sem tocar em
 * controller nem em regra de negócio (spec 010 §7.5).
 */
export abstract class PayoutProvider {
  abstract createPixPayout(request: PayoutRequest): Promise<PayoutResult>;
}

@Injectable()
export class ManualPixProvider extends PayoutProvider {
  private readonly logger = new Logger(ManualPixProvider.name);

  async createPixPayout(request: PayoutRequest): Promise<PayoutResult> {
    this.logger.log(
      `Pagamento manual: ${request.teacherName} — R$ ${request.amount.toFixed(2)} (${request.reference})`,
    );
    return {
      provider: 'manual-pix',
      status: 'manual',
      message: request.pixKey
        ? `Transfira R$ ${request.amount.toFixed(2)} via PIX para ${request.pixKey}`
        : 'Professora sem chave PIX cadastrada',
    };
  }
}
