import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

/** PUT = substituição total da turma. */
export class UpdateTurmaDto {
  @IsString()
  @IsOptional()
  teacherId?: string;

  @IsString()
  @IsOptional()
  teacherName?: string;

  @IsUrl({}, { message: 'Link da sala deve ser uma URL válida' })
  @IsOptional()
  meetUrl?: string;

  @IsNotEmpty({ message: 'Nome da turma é obrigatório' })
  @IsString()
  name!: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'A turma precisa de ao menos um aluno' })
  @IsString({ each: true })
  studentIds!: string[];

  @IsArray()
  @IsString({ each: true })
  studentNames!: string[];
}
