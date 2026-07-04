import { Module } from '@nestjs/common';
import { TurmaService } from './turma.service';
import { TurmaController } from './turma.controller';
import { TurmaRepository } from './turma.repository';

@Module({
  providers: [TurmaService, TurmaRepository],
  controllers: [TurmaController],
  exports: [TurmaService, TurmaRepository],
})
export class TurmaModule {}
