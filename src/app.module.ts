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
import { ArticleModule } from './articles/article.module';
import { UploadModule } from './uploads/upload.module';
import { TeacherModule } from './teachers/teacher.module';
import { AdminModule } from './admin/admin.module';
import { LessonModule } from './lessons/lesson.module';
import { RescheduleModule } from './reschedules/reschedule.module';
import { BillingModule } from './billing/billing.module';
import { SubscriptionModule } from './subscriptions/subscription.module';
import { FeedbackModule } from './feedbacks/feedback.module';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ActivePlanGuard } from './guards/active-plan.guard';
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
    ArticleModule,
    UploadModule,
    TeacherModule,
    AdminModule,
    LessonModule,
    RescheduleModule,
    BillingModule,
    SubscriptionModule,
    FeedbackModule,
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
    {
      // Depois do papel: só faz sentido perguntar se o aluno está em dia
      // quando já sabemos que ele é aluno e que a rota é dele (spec 012 RF13).
      provide: APP_GUARD,
      useClass: ActivePlanGuard,
    },
  ],
})
export class AppModule {}
