import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { LEVELS } from '../../types/student.level';
import type { PerceivedLevel } from '../feedback.entity';

export class CreateFeedbackDto {
  @IsString()
  @IsNotEmpty({ message: 'O feedback não pode ser vazio' })
  @MaxLength(2000)
  text!: string;

  @IsIn(LEVELS, { message: 'Nível inválido' })
  @IsOptional()
  perceivedLevel?: PerceivedLevel;

  @IsString()
  @IsOptional()
  lessonId?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data deve estar em YYYY-MM-DD' })
  @IsOptional()
  date?: string;
}
