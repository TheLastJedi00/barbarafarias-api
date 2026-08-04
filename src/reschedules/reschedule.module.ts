import { Module } from '@nestjs/common';
import {
  LessonRescheduleController,
  RescheduleController,
} from './reschedule.controller';
import { RescheduleService } from './reschedule.service';
import { RescheduleRepository } from './reschedule.repository';
import { LessonModule } from '../lessons/lesson.module';
import { NotificationModule } from '../notifications/notification.module';
import { SubscriptionModule } from '../subscriptions/subscription.module';

@Module({
  imports: [LessonModule, NotificationModule, SubscriptionModule],
  controllers: [LessonRescheduleController, RescheduleController],
  providers: [RescheduleService, RescheduleRepository],
  exports: [RescheduleService, RescheduleRepository],
})
export class RescheduleModule {}
