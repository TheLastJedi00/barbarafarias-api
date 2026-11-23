import { IsBoolean, IsString, MaxLength } from 'class-validator';

export class AnswerDto {
  /** `{deckId}:{cardId}`, como veio na missão. */
  @IsString()
  @MaxLength(200)
  cardKey!: string;

  /** `true` = arrastou para a direita sem virar a carta. */
  @IsBoolean()
  correct!: boolean;
}
