import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Tópico só de vídeo criado direto no painel de vídeo aulas (spec 027). */
export class CreateVideoTopicDto {
  @IsString()
  @IsNotEmpty({ message: 'O título do tópico é obrigatório' })
  @MaxLength(120)
  title!: string;
}
