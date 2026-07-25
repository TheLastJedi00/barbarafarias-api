import { Module } from '@nestjs/common';
import { CurriculumController } from './curriculum.controller';
import { CurriculumService } from './curriculum.service';
import { CurriculumRepository } from './curriculum.repository';

@Module({
  controllers: [CurriculumController],
  providers: [CurriculumService, CurriculumRepository],
  exports: [CurriculumService],
})
export class CurriculumModule {}
