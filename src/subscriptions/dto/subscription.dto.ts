import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PAYMENT_METHODS,
  SUBSCRIPTION_PLANS,
  Subscription,
  planConfig,
} from '../subscription.entity';
import type {
  Charge,
  PaymentMethod,
  SubscriptionPlan,
} from '../subscription.entity';

export class ChoosePlanDto {
  @IsIn(Object.values(SUBSCRIPTION_PLANS), { message: 'Plano inválido' })
  plan!: SubscriptionPlan;

  @IsIn(Object.values(PAYMENT_METHODS), {
    message: 'Forma de pagamento inválida',
  })
  paymentMethod!: PaymentMethod;

  /** Opcional: quando presente, é validado e abate o valor da parcela (RF16). */
  @IsString()
  @IsOptional()
  @MaxLength(40)
  couponCode?: string;
}

export class ChangePaymentMethodDto {
  @IsIn(Object.values(PAYMENT_METHODS), {
    message: 'Forma de pagamento inválida',
  })
  paymentMethod!: PaymentMethod;
}

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty({ message: 'O código é obrigatório' })
  @MaxLength(40)
  code!: string;

  @IsNumber()
  @IsPositive({ message: 'O desconto deve ser maior que zero' })
  discountAmount!: number;

  /** Ausente ou `null` = cupom vitalício, vale por toda a assinatura (RF15). */
  @IsInt()
  @Min(1)
  @IsOptional()
  durationMonths?: number | null;
}

export class ToggleCouponDto {
  @IsBoolean()
  active!: boolean;
}

/** Filtro `?month=YYYY-MM` das rotas do painel financeiro. */
export class MonthQueryDto {
  @Matches(/^\d{4}-\d{2}$/, { message: 'Mês deve estar em YYYY-MM' })
  @IsOptional()
  month?: string;
}

/**
 * O que o aluno precisa para pagar, devolvido por `POST /subscriptions/me`.
 *
 * PIX volta com QR Code e copia-e-cola para o modal. Cartão volta com o
 * `clientSecret` da sessão do Stripe, que o frontend monta na própria página
 * (spec 014) — `checkoutUrl` continua existindo para o caso de o cartão voltar
 * a sair por um gateway de checkout hospedado, e os dois nunca vêm juntos.
 */
export class ChoosePlanResponseDto {
  subscription!: SubscriptionDto;
  paymentMethod!: PaymentMethod;
  pixQrCodeUrl?: string;
  pixCopyPaste?: string;
  checkoutUrl?: string;
  clientSecret?: string;
  /** Explica por que não veio cobrança (ex.: gateway sem chave configurada). */
  warning?: string;
}

/**
 * Assinatura como o cliente a vê. Espelha a entidade porque não há campo
 * sensível a esconder — o que justifica a DTO é congelar o contrato da API
 * caso a entidade ganhe campos internos depois.
 */
export class SubscriptionDto {
  id!: string;
  studentId!: string;
  plan!: SubscriptionPlan;
  planLabel!: string;
  status!: string;
  paymentMethod!: PaymentMethod;
  totalAmount!: number;
  installments!: number;
  installmentAmount!: number;
  paidInstallments!: number;
  recurring!: boolean;
  charges!: Charge[];
  startDate!: string;
  nextChargeDate?: string;
  cancelledAt?: string;
  couponCode?: string;
  couponDiscount?: number;
  couponRemainingCharges?: number | null;
  createdAt!: string;
  updatedAt!: string;

  constructor(subscription: Subscription) {
    const config = planConfig(subscription.plan);
    Object.assign(this, subscription);
    this.planLabel = config.label;
    this.recurring = config.recurring;
  }
}
