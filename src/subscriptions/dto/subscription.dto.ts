import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  PAYMENT_METHODS,
  SUBSCRIPTION_PLANS,
  Subscription,
  CHARGE_STATUS,
  payerAmountsOf,
  regimeOf,
  PACKAGE_MAX_INSTALLMENTS,
} from '../subscription.entity';
import { PLAN_TIER_ID_LIST } from '../../plan-tiers/plan-tier.model';
import type { PlanTierId } from '../../plan-tiers/plan-tier.model';
import type {
  Charge,
  PaymentMethod,
  SubscriptionPlan,
} from '../subscription.entity';
import type { ChargeOutcome } from '../payment.gateway';
import {
  COUPON_PAYMENT_MODES,
  DISCOUNT_TYPES,
} from '../coupon.entity';
import type { CouponPaymentMode, DiscountType } from '../coupon.entity';

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
  /**
   * `PACKAGE` e `SUBSCRIPTION` compram um tier (spec 035); os três antigos
   * seguem aceitos até o front parar de mandá-los (ordem da spec 025).
   */
  @IsIn(Object.values(SUBSCRIPTION_PLANS), { message: 'Plano inválido' })
  plan!: SubscriptionPlan;

  /** Obrigatório no pacote e na assinatura; recusado nos planos antigos. */
  @IsOptional()
  @IsIn(PLAN_TIER_ID_LIST, { message: 'Plano inválido' })
  tierId?: PlanTierId;

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

  /**
   * Só o **pacote do tier** lê isto (spec 035 §4): ali o parcelamento é
   * escolha do comprador, com os juros dele. O teto de 12x é conferido de novo
   * no serviço. Nos outros regimes o campo é ignorado — as parcelas saem do
   * regime, como antes.
   */
  @IsOptional()
  @IsInt({ message: 'Parcelas inválidas' })
  @Min(1)
  @Max(PACKAGE_MAX_INSTALLMENTS)
  installments?: number;
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

  /**
   * Tier em que o cupom vale (spec 035). O front novo sempre manda. Ausente =
   * cupom dos planos antigos — o formato de antes, aceito até o front novo
   * entrar no ar (com `forbidNonWhitelisted`, recusá-lo derrubaria a tela).
   */
  @IsOptional()
  @IsIn(PLAN_TIER_ID_LIST, { message: 'Plano inválido' })
  tierId?: PlanTierId;

  @IsOptional()
  @IsIn(Object.values(DISCOUNT_TYPES), { message: 'Tipo de desconto inválido' })
  discountType?: DiscountType;

  /** Em R$ ou em %, conforme `discountType`. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'O desconto deve ser maior que zero' })
  discountValue?: number;

  /** **Obsoleto** (front de antes da spec 035): o mesmo que `discountValue` em R$. */
  @IsOptional()
  @IsNumber()
  @IsPositive({ message: 'O desconto deve ser maior que zero' })
  discountAmount?: number;

  /** Ausente ou `null` = cupom vitalício, vale por toda a assinatura (RF15). */
  @IsInt()
  @Min(1)
  @IsOptional()
  durationMonths?: number | null;

  /** Ausente = vale em todas as formas de pagamento. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(Object.values(COUPON_PAYMENT_MODES), {
    each: true,
    message: 'Forma de pagamento inválida',
  })
  paymentModes?: CouponPaymentMode[];

  /** Ausente ou `null` = ilimitado. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number | null;
}

/**
 * Contexto de `GET /subscriptions/coupons/:code` (spec 035). Com ele a
 * validação confere tier e forma de pagamento e devolve o desconto em reais;
 * sem ele, responde como antes.
 */
export class ValidateCouponQueryDto {
  @IsOptional()
  @IsIn(PLAN_TIER_ID_LIST, { message: 'Plano inválido' })
  tierId?: PlanTierId;

  @IsOptional()
  @IsIn(Object.values(SUBSCRIPTION_PLANS), { message: 'Plano inválido' })
  plan?: SubscriptionPlan;

  @IsOptional()
  @IsIn(Object.values(PAYMENT_METHODS), {
    message: 'Forma de pagamento inválida',
  })
  paymentMethod?: PaymentMethod;
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
  card?: {
    amount: number;
    installments: number;
    chargeIndex: number;
    /**
     * `true` só no pacote do tier: `installments` é o **teto**, e o comprador
     * escolhe de 1x até ele. Ausente = parcelas travadas em `installments`.
     */
    installmentsFree?: boolean;
  };
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
  /**
   * O total que a aluna paga, com os juros do parcelamento e o cupom já
   * aplicados — o número que ela reconhece da fatura.
   *
   * `totalAmount` continua sendo o que **cobramos**, porque é dele que sai a
   * receita por competência. São perguntas diferentes, e a tela que mostrar a
   * errada faz a aluna procurar um valor que não existe no extrato dela.
   */
  payerTotal!: number;
  payerInstallment!: number;
  /**
   * A parcela em aberto já tem uma cobrança emitida lá fora (spec 023 P2).
   *
   * É o que habilita "Recomeçar o pagamento" na tela. Vai como **booleano**, e
   * não como o id: a aluna não tem o que fazer com um identificador do gateway,
   * e mandá-lo seria expor o que a cobrança dupla explora.
   */
  hasOpenCardAttempt!: boolean;
  couponCode?: string;
  couponDiscount?: number;
  couponRemainingCharges?: number | null;
  /** Tier comprado (spec 035). Ausentes nas assinaturas antigas. */
  tierId?: PlanTierId;
  tierName?: string;
  priceSnapshot?: number;
  cardInstallments?: number;
  fidelityUntil?: string;
  fidelityBrokenAt?: string;
  createdAt!: string;
  updatedAt!: string;

  constructor(subscription: Subscription) {
    const config = regimeOf(subscription);
    Object.assign(this, subscription);
    this.planLabel = config.label;
    this.recurring = config.recurring;

    const pagador = payerAmountsOf(subscription);
    this.payerTotal = pagador.total;
    this.payerInstallment = pagador.installment;

    const emAberto = subscription.charges?.find(
      (charge) => charge.status !== CHARGE_STATUS.PAID,
    );
    this.hasOpenCardAttempt = !!emAberto?.gatewayChargeId;
  }
}
