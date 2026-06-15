import { Module } from '@nestjs/common';
import { SupplyService } from './supply.service';
import { SupplyRepository } from './supply.repository';
import { SupplyController } from './supply.controller';
import { PromptsModule } from '../prompts/prompts.module';
import { GeminiProvider } from './gemini/gemini.service';
import { UserModule } from '../users/user.module';

@Module({
  imports: [UserModule, PromptsModule],
  controllers: [SupplyController],
  providers: [SupplyService, SupplyRepository, GeminiProvider],
})
export class SupplyModule {}
