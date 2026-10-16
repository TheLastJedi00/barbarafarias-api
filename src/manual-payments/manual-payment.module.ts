import { Module } from '@nestjs/common';
import { ManualPaymentRepository } from './manual-payment.repository';

/**
 * Só o repositório (spec 026 §9). Quem escreve é o `UserModule` (a concessão
 * de acesso) e quem lê é o financeiro; um módulo próprio evita que um importe
 * o outro — o `ManagerFinanceModule` já arrasta Billing e Subscription.
 */
@Module({
  providers: [ManualPaymentRepository],
  exports: [ManualPaymentRepository],
})
export class ManualPaymentModule {}
