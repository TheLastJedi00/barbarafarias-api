import { Module } from '@nestjs/common';
import {
  LessonRescheduleController,
  RescheduleController,
} from './reschedule.controller';
import { RescheduleService } from './reschedule.service';
import { RescheduleRepository } from './reschedule.repository';
import { LessonModule } from '../lessons/lesson.module';

@Module({
  imports: [LessonModule],
  controllers: [LessonRescheduleController, RescheduleController],
  providers: [RescheduleService, RescheduleRepository],
  exports: [RescheduleService, RescheduleRepository],
})
export class RescheduleModule {}
