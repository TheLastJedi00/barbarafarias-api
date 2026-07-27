import { Module } from '@nestjs/common';
import { LessonController } from './lesson.controller';
import { LessonService } from './lesson.service';
import { LessonRepository } from './lesson.repository';
import { AgendaModule } from '../agenda/agenda.module';
import { UserModule } from '../users/user.module';
import { TurmaModule } from '../turmas/turma.module';
import { LessonAccessService } from './lesson-access.service';

@Module({
  imports: [AgendaModule, UserModule, TurmaModule],
  controllers: [LessonController],
  providers: [LessonService, LessonRepository, LessonAccessService],
  exports: [LessonService, LessonRepository, LessonAccessService],
})
export class LessonModule {}
