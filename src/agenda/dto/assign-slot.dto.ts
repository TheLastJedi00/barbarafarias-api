import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidateIf,
  ValidatorConstraint,
} from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import { FIRST_HOUR, LAST_HOUR, isValidSlotHour } from '../../common/slot-time';

/** Barra horas como 8.25: a agenda só existe em passos de 30 minutos. */
@ValidatorConstraint({ name: 'isHalfHourStep', async: false })
export class IsHalfHourStep implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'number' && isValidSlotHour(value);
  }

  defaultMessage(): string {
    return 'hour deve estar em passos de 30 minutos (ex.: 8, 8.5, 9)';
  }
}

export class AssignSlotDto {
  /** Professora dona do slot; a gerente pode informar qualquer uma. Se omitido, assume o usuário logado no controller. */
  @IsString()
  @IsOptional()
  teacherId?: string;

  @IsString()
  @IsOptional()
  teacherName?: string;

  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  /** Hora decimal em passos de 30 min: 8 = 08:00, 8.5 = 08:30 (spec 011 RF4). */
  @IsNumber()
  @Min(FIRST_HOUR)
  @Max(LAST_HOUR)
  @Validate(IsHalfHourStep)
  hour!: number;

  /** 1 = meia hora, 2 = aula padrão de 1 hora. Ausente equivale a 2 (RF5). */
  @IsInt()
  @IsIn([1, 2])
  @IsOptional()
  slotCount?: number;

  @IsIn(['student', 'turma'])
  occupantType!: 'student' | 'turma';

  @ValidateIf((o) => o.occupantType === 'student')
  @IsString()
  studentId?: string;

  @ValidateIf((o) => o.occupantType === 'student')
  @IsString()
  studentName?: string;

  @ValidateIf((o) => o.occupantType === 'turma')
  @IsString()
  turmaId?: string;

  @ValidateIf((o) => o.occupantType === 'turma')
  @IsString()
  turmaName?: string;
}
