import { Module } from '@nestjs/common';
import { SupplyService } from './supply.service';
import { SupplyFirestoreRepository } from '../infrastructure/supply.repository';
import { SupplyController } from './supply.controller';
import { GeminiProvider } from '../infrastructure/gemini';
import { PromptFirestoreRepository } from '../infrastructure/prompt.repository';
import { UserModule } from '../../users/user.module';
import { TeacherModule } from '../../teacher/application/teacher.module';

@Module({
  imports: [UserModule, TeacherModule],
  controllers: [SupplyController],
  providers: [
    SupplyService,
    {
      provide: 'SupplyRepository',
      useClass: SupplyFirestoreRepository,
    },
    {
      provide: 'GenerativeAIService',
      useClass: GeminiProvider,
    },
    {
      provide: 'PromptRepository',
      useClass: PromptFirestoreRepository,
    }
  ],
})
export class SupplyModule {}
