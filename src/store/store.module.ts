import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { LegalModule } from '../legal/legal.module';
import { UserModule } from '../users/user.module';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { UploadModule } from '../uploads/upload.module';
import { StoreAdminController } from './store-admin.controller';
import { StoreAdminService } from './store-admin.service';
import { StoreCatalogController } from './store-catalog.controller';
import { StoreCatalogService } from './store-catalog.service';
import { StoreContentRepository } from './store-content.repository';
import { StoreSignupController } from './store-signup.controller';
import { StoreSignupService } from './store-signup.service';
import { StoreProductRepository } from './store-product.repository';
import { StorePurchaseRepository } from './store-purchase.repository';

/**
 * Loja de módulos avulsos (spec 032): catálogo, compra e acesso por módulo.
 *
 * Não importa o módulo de vídeo aulas — é ele que vai consultar a loja para
 * decidir o acesso, e a dependência no sentido contrário seria circular.
 */
@Module({
  imports: [
    AuthModule,
    CurriculumModule,
    LegalModule,
    UploadModule,
    UserModule,
    // O cadastro é público: freio por IP, como no recrutamento (o
    // ThrottlerGuard não é global de propósito).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
  ],
  controllers: [
    StoreAdminController,
    StoreCatalogController,
    StoreSignupController,
  ],
  providers: [
    StoreAdminService,
    StoreCatalogService,
    StoreContentRepository,
    StoreSignupService,
    StoreProductRepository,
    StorePurchaseRepository,
  ],
  exports: [StoreProductRepository, StorePurchaseRepository],
})
export class StoreModule {}
