import { Module } from '@nestjs/common';
import { ApplicationRepository } from './application.repository';
import { CandidateRepository } from './candidate.repository';
import { JobController } from './job.controller';
import { JobRepository } from './job.repository';
import { JobService } from './job.service';

/**
 * Trabalhe Conosco (spec 028): vagas, candidatos e candidaturas. O candidato
 * mora em `candidates`, fora de `users`.
 */
@Module({
  controllers: [JobController],
  providers: [
    JobService,
    JobRepository,
    ApplicationRepository,
    CandidateRepository,
  ],
})
export class RecruitmentModule {}
