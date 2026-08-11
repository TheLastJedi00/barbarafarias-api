import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
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
import type { ChargeOutcome } from '../payment.gateway';

/**
 * O aceite dos termos, **dentro** da contratação (spec 023 §7.2).
 *
 * Não é uma rota à parte de propósito: rota separada permitiria plano sem
 * aceite e aceite sem plano — que é exatamente o buraco que este mecanismo
 * existe para fechar. Aqui, ou os dois acontecem, ou nenhum.
 */
export class PlanAcceptanceDto {
  /** Qual redação o aluno leu. Sem ela o histórico não sabe o que foi aceito. */
  @IsString()
  @IsNotEmpty({ message: 'A versão dos termos é obrigatória' })
  @MaxLength(20)
  termsVersion!: string;

  /**
   * `true` e nada mais. `@Equals` em vez de `@IsBoolean`: um `false` que passa
   * pela validação vira um aceite gravado dizendo que o aluno não aceitou.
   */
  @Equals(true, { message: 'É preciso aceitar os termos para contratar' })
  accepted!: boolean;
}

export class ChoosePlanDto {
  @IsIn(Object.values(SUBSCRIPTION_PLANS), { message: 'Plano inválido' })
  plan!: SubscriptionPlan;

  @IsIn(Object.values(PAYMENT_METHODS), {
    message: 'Forma de pagamento inválida',
  })
  paymentMethod!: PaymentMethod;

  /**
   * **Obrigatório.** Sem ele a contratação devolve 400 e **nenhuma cobrança é
   * criada**: um aluno debitado em R$ 2.280 sem registro de que concordou é a
   * exposição que este campo existe para fechar.
   */
  @IsObject()
  @ValidateNested()
  @Type(() => PlanAcceptanceDto)
  acceptance!: PlanAcceptanceDto;

  /** Opcional: quando presente, é validado e abate o valor da parcela (RF16). */
  @IsString()
  @IsOptional()
  @MaxLength(40)
  couponCode?: string;
}

/**
 * O cartão tokenizado no navegador, para `POST /subscriptions/me/card`.
 *
 * Repare no que **não** está aqui: número, CVC, validade e — de propósito —
 * `installments`. O número de parcelas do plano sai do `PLAN_CONFIGS` no
 * backend; aceitá-lo do cliente transformaria a trava do formulário na única
 * régua, e ela é conveniência, não segurança.
 */
export class CardPaymentDto {
  @IsString()
  @IsNotEmpty({ message: 'O token do cartão é obrigatório' })
  @MaxLength(120)
  token!: string;

  /** Bandeira resolvida pelo formulário do gateway (`master`, `visa`, …). */
  @IsString()
  @IsNotEmpty({ message: 'A bandeira do cartão é obrigatória' })
  @MaxLength(40)
  paymentMethodId!: string;
}

/** O que a tela precisa saber depois de mandar o cartão. */
export class CardPaymentResponseDto {
  subscription!: SubscriptionDto;
  /** `PAID`, `PENDING`, `CHALLENGE`. `REJECTED` volta como 400. */
  outcome!: ChargeOutcome;
  /** Só quando `outcome === 'CHALLENGE'`: onde o aluno completa o 3DS. */
  challengeUrl?: string;
  warning?: string;
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
 * Os dois métodos saem por caminhos diferentes, e **nunca vêm juntos**:
 *
 * - **PIX** já volta com QR Code e copia-e-cola: a cobrança foi emitida.
 * - **Cartão** volta com `card`, que é só o que a tela precisa para montar o
 *   formulário — valor e parcelas. A cobrança ainda não existe, porque o token
 *   do cartão nasce no navegador, depois desta resposta.
 */
export class ChoosePlanResponseDto {
  subscription!: SubscriptionDto;
  paymentMethod!: PaymentMethod;
  pixQrCodeUrl?: string;
  pixCopyPaste?: string;
  /** Parâmetros do formulário de cartão. Ver `CardPaymentDto`. */
  card?: { amount: number; installments: number; chargeIndex: number };
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
  /**
   * Até quando o acesso vale. A tela precisa dela **antes** do cancelamento:
   * é o que transforma "seu acesso é encerrado" em uma data que a aluna pode
   * conferir contra o que pagou.
   */
  accessUntil?: string;
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
