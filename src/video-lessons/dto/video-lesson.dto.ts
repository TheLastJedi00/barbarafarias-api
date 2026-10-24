import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { LEVELS, type Level } from '../../types/student.level';

/**
 * Metadados do vídeo a enviar. O binário **não** vem aqui: a resposta traz a
 * URL de upload direto ao Storage (spec 027 §2).
 */
export class CreateVideoLessonDto {
  @IsIn(LEVELS)
  level!: Level;

  @IsString()
  @IsNotEmpty({ message: 'Escolha o tópico do vídeo' })
  topicId!: string;

  @IsString()
  @IsNotEmpty({ message: 'O título é obrigatório' })
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  size!: number;
}

/** Edição: título, descrição e mudança de tópico (dentro do mesmo nível). */
export class UpdateVideoLessonDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'O título é obrigatório' })
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  topicId?: string;
}

/** Nova ordem dos vídeos de um tópico: os ids na sequência desejada. */
export class ReorderVideoLessonsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];
}

export class CreateMaterialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  size!: number;
}
