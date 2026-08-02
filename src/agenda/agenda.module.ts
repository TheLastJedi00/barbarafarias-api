import { Module } from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { AgendaController } from './agenda.controller';
import { AgendaRepository } from './agenda.repository';
import { TurmaModule } from '../turmas/turma.module';
import { SubscriptionModule } from '../subscriptions/subscription.module';

@Module({
  // TurmaModule resolve o horário do aluno; SubscriptionModule barra alocar
  // aula para aluno inadimplente (spec 012 RF14).
  imports: [TurmaModule, SubscriptionModule],
  providers: [AgendaService, AgendaRepository],
  controllers: [AgendaController],
  exports: [AgendaService, AgendaRepository],
})
export class AgendaModule {}
