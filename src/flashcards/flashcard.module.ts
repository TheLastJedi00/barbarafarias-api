import { Module } from '@nestjs/common';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { GeminiProvider } from '../supply/gemini/gemini.service';
import { UserModule } from '../users/user.module';
import { FlashcardDeckRepository } from './flashcard-deck.repository';
import { FlashcardController } from './flashcard.controller';
import { FlashcardService } from './flashcard.service';

/** Baralhos de flashcards (spec 037). A missão diária vive no `PracticeModule`. */
@Module({
  imports: [CurriculumModule, UserModule],
  controllers: [FlashcardController],
  providers: [FlashcardService, FlashcardDeckRepository, GeminiProvider],
  exports: [FlashcardService, FlashcardDeckRepository],
})
export class FlashcardModule {}
