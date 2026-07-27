import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UserModule } from './users/user.module';
import { SupplyModule } from './supply/supply.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { VideoModule } from './video/video.module';
import { PromptsModule } from './prompts/prompts.module';
import { TurmaModule } from './turmas/turma.module';
import { AgendaModule } from './agenda/agenda.module';
import { CurriculumModule } from './curriculum/curriculum.module';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { FirestoreModule } from './firestore/firestore.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    FirestoreModule,
    UserModule,
    SupplyModule,
    AuthModule,
    VideoModule,
    PromptsModule,
    TurmaModule,
    AgendaModule,
    CurriculumModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
