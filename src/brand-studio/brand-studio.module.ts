import { Module } from '@nestjs/common';
import { BrandIdentityRepository } from './brand-identity.repository';

/**
 * Campanha (spec 031): identidades visuais e geração de artes para as redes
 * sociais da escola. Exclusivo da gerente.
 */
@Module({
  providers: [BrandIdentityRepository],
})
export class BrandStudioModule {}
