import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { REASON_TYPES } from '../reschedule.entity';
import type { ReasonType } from '../reschedule.entity';

export class CreateRescheduleDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data deve estar em YYYY-MM-DD' })
  proposedDate!: string;

  @IsInt()
  @Min(8)
  @Max(20)
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
