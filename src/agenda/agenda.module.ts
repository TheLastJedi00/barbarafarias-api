import { Module } from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { AgendaController } from './agenda.controller';
import { AgendaRepository } from './agenda.repository';
import { TurmaModule } from '../turmas/turma.module';

@Module({
  imports: [TurmaModule], // usa o TurmaRepository para resolver o horário do aluno
  providers: [AgendaService, AgendaRepository],
  controllers: [AgendaController],
  exports: [AgendaService, AgendaRepository],
})
export class AgendaModule {}
