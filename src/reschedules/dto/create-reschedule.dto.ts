import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
} from 'class-validator';
import { REASON_TYPES } from '../reschedule.entity';
import type { ReasonType } from '../reschedule.entity';
import { IsHalfHourStep } from '../../common/half-hour-step.validator';
import { FIRST_HOUR, LAST_HOUR } from '../../common/slot-time';

export class CreateRescheduleDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data deve estar em YYYY-MM-DD' })
  proposedDate!: string;

  /**
   * Hora decimal em passos de 30 min (spec 011 RF4). Era `@IsInt()`: remarcar
   * para 08:30 — ou para as 20:30, último início válido da grade — devolvia
   * 400, e a sugestão pós-ausência de uma aula de meia-hora vinha com um
   * valor que a própria API recusava.
   */
  @IsNumber()
  @Min(FIRST_HOUR)
  @Max(LAST_HOUR)
  @Validate(IsHalfHourStep)
  proposedHour!: number;

  @IsIn(Object.values(REASON_TYPES), { message: 'Motivo inválido' })
  reasonType!: ReasonType;

  // "outro" sem descrição não diz nada à gerente — por isso é obrigatória.
  @ValidateIf((dto) => dto.reasonType === REASON_TYPES.OUTRO)
  @IsString()
  @IsNotEmpty({ message: 'Descreva o motivo quando escolher "outro"' })
  @MaxLength(500)
  @IsOptional()
  reasonText?: string;
}

export class DecisionDto {
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;
}
