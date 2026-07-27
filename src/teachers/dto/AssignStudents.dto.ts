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
  ValidateNested,
} from 'class-validator';

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

  @IsInt()
  @Min(8)
  @Max(20)
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
