import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/** Teto de sanidade: um zero a mais digitado não pode virar vitrine. */
const MAX_PRICE = 100_000;

/**
 * O que a gerente edita num tier (spec 035 §3). Texto e `active` valem na
 * hora; os dois preços vão para o agendado da próxima meia-noite (§11).
 */
export class UpdatePlanTierDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  benefits?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Ausente = não mexe. `null` é recusado: o pacote sempre tem preço. */
  @ValidateIf((dto: UpdatePlanTierDto) => dto.packagePrice !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Preço do pacote inválido' })
  @IsPositive({ message: 'O preço do pacote precisa ser maior que zero' })
  @Max(MAX_PRICE)
  packagePrice?: number;

  /** Ausente = não mexe. `null` = o tier deixa de vender assinatura. */
  @ValidateIf(
    (dto: UpdatePlanTierDto) =>
      dto.monthlyPrice !== undefined && dto.monthlyPrice !== null,
  )
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Mensalidade inválida' })
  @IsPositive({ message: 'A mensalidade precisa ser maior que zero' })
  @Max(MAX_PRICE)
  monthlyPrice?: number | null;
}
