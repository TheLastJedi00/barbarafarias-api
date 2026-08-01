import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  Validate,
  ValidateNested,
} from 'class-validator';
import { IsHalfHourStep } from '../../common/half-hour-step.validator';
import { FIRST_HOUR, LAST_HOUR } from '../../common/slot-time';

/** Roster completo de alunos de uma professora (substitui o anterior). */
export class AssignStudentsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  studentIds!: string[];
}

export class WeeklySlotDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  /** Mesma grade de 30 min da agenda (spec 011 RF4): 8, 8.5 … 20.5. */
  @IsNumber()
  @Min(FIRST_HOUR)
  @Max(LAST_HOUR)
  @Validate(IsHalfHourStep)
  hour!: number;
}

/** Configuração do aluno feita pela gerente (RF5–RF8). */
export class UpdateStudentAssignmentDto {
  @IsString()
  @IsOptional()
  teacherId?: string | null;

  @IsNumber()
  @Min(1)
  @Max(7)
  @IsOptional()
  lessonsPerWeek?: number;

  @ValidateNested()
  @Type(() => WeeklySlotDto)
  @IsOptional()
  makeupSlot?: WeeklySlotDto;

  @IsUrl({}, { message: 'Link da sala deve ser uma URL válida' })
  @IsOptional()
  meetUrl?: string;
}
