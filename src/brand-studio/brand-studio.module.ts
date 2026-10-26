import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { GeminiProvider } from '../supply/gemini/gemini.service';
import { UploadModule } from '../uploads/upload.module';
import { ArtworkController } from './artwork.controller';
import { ArtworkRepository } from './artwork.repository';
import { ArtworkService } from './artwork.service';
import { BrandIdentityController } from './brand-identity.controller';
import { BrandIdentityRepository } from './brand-identity.repository';
import { BrandIdentityService } from './brand-identity.service';

/**
 * Campanha (spec 031): identidades visuais e geração de artes para as redes
 * sociais da escola. Exclusivo da gerente.
 */
@Module({
  // Freio das rotas que chamam o Gemini (o ThrottlerGuard não é global).
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    UploadModule,
  ],
  controllers: [BrandIdentityController, ArtworkController],
  providers: [
    BrandIdentityService,
    BrandIdentityRepository,
    ArtworkService,
    ArtworkRepository,
    // Sem estado além do cliente do Gemini: provido aqui como no SupplyModule,
    // em vez de acoplar a Campanha ao módulo de material.
    GeminiProvider,
  ],
})
export class BrandStudioModule {}
