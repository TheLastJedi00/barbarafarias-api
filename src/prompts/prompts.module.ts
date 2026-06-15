import { Module } from '@nestjs/common';
import { PromptRepository } from './prompt.repository';
import { PromptService } from './prompt.service';

@Module({
  providers: [PromptService, PromptRepository],
  exports: [PromptService],
})
export class PromptsModule {}
