import { Module } from '@nestjs/common';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { FlashcardModule } from '../flashcards/flashcard.module';
import { StoreModule } from '../store/store.module';
import { UserModule } from '../users/user.module';
import { PracticeController } from './practice.controller';
import { PracticeRepository } from './practice.repository';
import { PracticeService } from './practice.service';

/** Missão diária de flashcards (spec 037). */
@Module({
  imports: [FlashcardModule, CurriculumModule, UserModule, StoreModule],
  controllers: [PracticeController],
  providers: [PracticeService, PracticeRepository],
})
export class PracticeModule {}
