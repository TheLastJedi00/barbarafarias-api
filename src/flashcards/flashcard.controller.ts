import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';
import { LEVELS, Level } from '../types/student.level';
import { FlashcardDeck } from './flashcard.model';
import { FlashcardService } from './flashcard.service';

/** O que a gestão recebe depois de gerar: o estado, não as 40–62 cartas. */
export interface GeneratedDeckResponse {
  id: string;
  status: FlashcardDeck['status'];
  cardCount: number;
  generatedAt?: string;
}

/**
 * Gestão dos baralhos (spec 037 §5.5). A professora cuida dos de tópico pelo
 * Prompt Manager; o do aluno é da gerente, na ficha dele. A missão do aluno
 * mora no `PracticeController`.
 */
@Controller('flashcards')
export class FlashcardController {
  constructor(private readonly service: FlashcardService) {}

  @Get('topics/:level')
  @Roles(ROLES.TEACHER)
  listTopicDecks(@Param('level') level: string) {
    return this.service.listTopicDecks(this.parseLevel(level));
  }

  /** Um tópico por requisição: gerar vários de uma vez estouraria o tempo da função. */
  @Post('topics/:level/:topicId/generate')
  @Roles(ROLES.TEACHER)
  async generateTopicDeck(
    @Param('level') level: string,
    @Param('topicId') topicId: string,
  ): Promise<GeneratedDeckResponse> {
    return this.summary(
      await this.service.generateTopicDeck(this.parseLevel(level), topicId),
    );
  }

  @Get('students/:id')
  @Roles(ROLES.MANAGER)
  getStudentDeck(@Param('id') id: string) {
    return this.service.getStudentDeckSummary(id);
  }

  @Post('students/:id/generate')
  @Roles(ROLES.MANAGER)
  async generateStudentDeck(
    @Param('id') id: string,
  ): Promise<GeneratedDeckResponse> {
    return this.summary(await this.service.generateStudentDeck(id));
  }

  private summary(deck: FlashcardDeck): GeneratedDeckResponse {
    return {
      id: deck.id,
      status: deck.status,
      cardCount: deck.cards.length,
      generatedAt: deck.generatedAt,
    };
  }

  private parseLevel(level: string): Level {
    if (!(LEVELS as readonly string[]).includes(level)) {
      throw new BadRequestException(
        `Nível inválido: "${level}". Use um de ${LEVELS.join(', ')}.`,
      );
    }
    return level as Level;
  }
}
