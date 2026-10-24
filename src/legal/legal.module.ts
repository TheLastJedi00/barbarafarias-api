import { Module } from '@nestjs/common';
import { LegalRepository } from './legal.repository';

/**
 * Painel Jurídico (spec 029): Termos de Uso, Política de Privacidade e termo
 * do recrutamento, versionados, com o aceite de cada usuário.
 */
@Module({
  providers: [LegalRepository],
  exports: [LegalRepository],
})
export class LegalModule {}
