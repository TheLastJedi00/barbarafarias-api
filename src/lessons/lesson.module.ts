import { Module } from '@nestjs/common';
import { LessonController } from './lesson.controller';
import { LessonService } from './lesson.service';
import { LessonRepository } from './lesson.repository';
import { AgendaModule } from '../agenda/agenda.module';
import { UserModule } from '../users/user.module';
import { TurmaModule } from '../turmas/turma.module';
import { LessonAccessService } from './lesson-access.service';
import { MakeupService } from './makeup.service';
import { NotificationModule } from '../notifications/notification.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    AgendaModule,
    UserModule,
    TurmaModule,
    NotificationModule,
    BillingModule,
  ],
  controllers: [LessonController],
  providers: [
    LessonService,
    LessonRepository,
    LessonAccessService,
    MakeupService,
  ],
  exports: [
    LessonService,
    LessonRepository,
    LessonAccessService,
    MakeupService,
  ],
})
export class LessonModule {}
