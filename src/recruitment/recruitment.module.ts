import { Module } from '@nestjs/common';
import { ApplicationRepository } from './application.repository';
import { CandidateRepository } from './candidate.repository';
import { JobRepository } from './job.repository';

/**
 * Trabalhe Conosco (spec 028): vagas, candidatos e candidaturas. O candidato
 * mora em `candidates`, fora de `users`.
 */
@Module({
  providers: [JobRepository, ApplicationRepository, CandidateRepository],
})
export class RecruitmentModule {}
