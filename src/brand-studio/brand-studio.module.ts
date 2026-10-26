import { Module } from '@nestjs/common';
import { BrandIdentityController } from './brand-identity.controller';
import { BrandIdentityRepository } from './brand-identity.repository';
import { BrandIdentityService } from './brand-identity.service';

/**
 * Campanha (spec 031): identidades visuais e geração de artes para as redes
 * sociais da escola. Exclusivo da gerente.
 */
@Module({
  controllers: [BrandIdentityController],
  providers: [BrandIdentityService, BrandIdentityRepository],
})
export class BrandStudioModule {}
