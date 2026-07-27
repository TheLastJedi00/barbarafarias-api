import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RateLessonDto {
  @IsInt({ message: 'A nota deve ser um número inteiro' })
  @Min(1, { message: 'A nota mínima é 1 estrela' })
  @Max(5, { message: 'A nota máxima é 5 estrelas' })
  stars!: number;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  comment?: string;
}
