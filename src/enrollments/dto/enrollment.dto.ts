import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PlanAcceptanceDto } from '../../subscriptions/dto/subscription.dto';
import {
  PAYMENT_METHODS,
  TIER_PLANS,
  type PaymentMethod,
  type TierPlan,
} from '../../subscriptions/subscription.entity';

/** Matrícula numa turma em formação (spec 036). */
export class CreateEnrollmentDto {
  @IsString()
  @IsNotEmpty({ message: 'Escolha a turma' })
  turmaId!: string;

  /** Como o aluno vai pagar o plano quando a turma fechar. */
  @IsIn(Object.values(TIER_PLANS), { message: 'Modalidade inválida' })
  mode!: TierPlan;

  /** Do sinal. */
  @IsIn(Object.values(PAYMENT_METHODS), {
    message: 'Forma de pagamento inválida',
  })
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string;

  /** Obrigatório: sem o aceite nada é criado, nem o contrato. */
  @IsObject()
  @ValidateNested()
  @Type(() => PlanAcceptanceDto)
  acceptance!: PlanAcceptanceDto;
}

export class EnrollmentCardDto {
  @IsString()
  @IsNotEmpty({ message: 'O token do cartão é obrigatório' })
  @MaxLength(120)
  token!: string;

  @IsString()
  @IsNotEmpty({ message: 'A bandeira do cartão é obrigatória' })
  @MaxLength(40)
  paymentMethodId!: string;
}

export class EnrollmentTermsQueryDto {
  @IsString()
  @IsNotEmpty()
  turmaId!: string;

  @IsIn(Object.values(TIER_PLANS), { message: 'Modalidade inválida' })
  mode!: TierPlan;
}
