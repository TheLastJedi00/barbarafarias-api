import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalRepository } from './legal.repository';
import { LegalService } from './legal.service';

/**
 * Painel Jurídico (spec 029): Termos de Uso, Política de Privacidade e termo
 * do recrutamento, versionados, com o aceite de cada usuário.
 */
@Module({
  controllers: [LegalController],
  providers: [LegalService, LegalRepository],
  exports: [LegalService, LegalRepository],
})
export class LegalModule {}
