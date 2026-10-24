import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notifications/notification.module';
import { UploadModule } from '../uploads/upload.module';
import { ApplicationController } from './application.controller';
import { ApplicationRepository } from './application.repository';
import { ApplicationService } from './application.service';
import { CandidateController } from './candidate.controller';
import { CandidateRepository } from './candidate.repository';
import { CandidateService } from './candidate.service';
import { JobController } from './job.controller';
import { JobRepository } from './job.repository';
import { JobService } from './job.service';
import { TalentPoolController } from './talent-pool.controller';
import { RecruitmentTermsController } from './terms/recruitment-terms.controller';

/**
 * Trabalhe Conosco (spec 028): vagas, candidatos e candidaturas. O candidato
 * mora em `candidates`, fora de `users`.
 */
@Module({
  imports: [
    AuthModule,
    NotificationModule,
    UploadModule,
    // O cadastro é público: freio por IP, como no AuthModule (o
    // ThrottlerGuard não é global de propósito).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
  ],
  controllers: [
    JobController,
    CandidateController,
    ApplicationController,
    TalentPoolController,
    RecruitmentTermsController,
  ],
  providers: [
    JobService,
    JobRepository,
    CandidateService,
    CandidateRepository,
    ApplicationService,
    ApplicationRepository,
  ],
})
export class RecruitmentModule {}
