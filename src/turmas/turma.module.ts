import { Module } from '@nestjs/common';
import { TurmaService } from './turma.service';
import { TurmaController } from './turma.controller';
import { TurmaRepository } from './turma.repository';
import { TurmaFormingService } from './turma-forming.service';
import { TeacherModule } from '../teachers/teacher.module';

@Module({
  imports: [TeacherModule],
  providers: [TurmaService, TurmaRepository, TurmaFormingService],
  controllers: [TurmaController],
  exports: [TurmaService, TurmaRepository, TurmaFormingService],
})
export class TurmaModule {}
