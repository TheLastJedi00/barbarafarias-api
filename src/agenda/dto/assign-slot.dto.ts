import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class AssignSlotDto {
  /** Professora dona do slot; a gerente pode informar qualquer uma. */
  @IsString()
  teacherId!: string;

  @IsString()
  @IsOptional()
  teacherName?: string;

  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsInt()
  @Min(8)
  @Max(20)
  hour!: number;

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
