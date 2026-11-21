import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { GROUP_TIER_IDS, type GroupTierId } from '../turma-schedule';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turma em formação (spec 036). O DTO confere o formato; o calendário (start
 * compatível, semanas do mensal, horário de 1 hora) é regra do serviço, que a
 * aplica também na edição.
 */
export class CreateFormingTurmaDto {
  @IsIn(GROUP_TIER_IDS, { message: 'Plano de grupo inválido' })
  tierId!: GroupTierId;

  @IsString()
  @IsNotEmpty({ message: 'Escolha a professora da turma' })
  teacherId!: string;

  @IsInt({ message: 'Dia da semana inválido' })
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsNumber({}, { message: 'Horário inválido' })
  hour!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsInt({ each: true })
  weeksOfMonth?: number[];

  @IsOptional()
  @IsInt()
  founderWeek?: number;

  @Matches(DATE, { message: 'Data de início inválida' })
  startDate!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  minStudents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxStudents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Link da sala deve ser uma URL válida' })
  meetUrl?: string;
}

/** Tudo opcional; o tier não muda (outra turma, outro preço, outro contrato). */
export class UpdateFormingTurmaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  teacherId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsNumber()
  hour?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsInt({ each: true })
  weeksOfMonth?: number[];

  @IsOptional()
  @IsInt()
  founderWeek?: number;

  @IsOptional()
  @Matches(DATE, { message: 'Data de início inválida' })
  startDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  minStudents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxStudents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Link da sala deve ser uma URL válida' })
  meetUrl?: string;
}
