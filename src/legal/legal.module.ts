import { Module } from '@nestjs/common';
import { UserRepository } from '../users/user.repository';
import { CandidateRepository } from '../recruitment/candidate.repository';
import { LegalAdminController } from './legal-admin.controller';
import { LegalAdminService } from './legal-admin.service';
import { LegalController } from './legal.controller';
import { LegalRepository } from './legal.repository';
import { LegalService } from './legal.service';

/**
 * Painel Jurídico (spec 029): Termos de Uso, Política de Privacidade e termo
 * do recrutamento, versionados, com o aceite de cada usuário.
 */
@Module({
  controllers: [LegalController, LegalAdminController],
  providers: [
    LegalService,
    LegalAdminService,
    LegalRepository,
    // Repositórios sem estado sobre o Firestore global, providos aqui como no
    // AuthModule: importar UserModule/RecruitmentModule criaria ciclo quando
    // o recrutamento passar a depender do legal.
    UserRepository,
    CandidateRepository,
  ],
  exports: [LegalService, LegalRepository],
})
export class LegalModule {}
