import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class CreateTurmaDto {
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
