import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { LegalModule } from '../legal/legal.module';
import { MercadoPagoModule } from '../subscriptions/mercadopago.module';
import { NotificationModule } from '../notifications/notification.module';
import { UserModule } from '../users/user.module';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { UploadModule } from '../uploads/upload.module';
import { StoreAdminController } from './store-admin.controller';
import { StoreAdminService } from './store-admin.service';
import {
  StoreCatalogController,
  StoreUserCatalogController,
} from './store-catalog.controller';
import { StoreCatalogService } from './store-catalog.service';
import { StoreContentRepository } from './store-content.repository';
import { StoreSignupController } from './store-signup.controller';
import { StoreSignupService } from './store-signup.service';
import { StoreOnboardingController } from './store-onboarding.controller';
import {
  StoreAdminPurchaseController,
  StorePurchaseController,
} from './store-purchase.controller';
import { StorePurchaseService } from './store-purchase.service';
import { ModuleAccessService } from './module-access.service';
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
    ConfigModule,
    CurriculumModule,
    LegalModule,
    MercadoPagoModule,
    NotificationModule,
    UploadModule,
    UserModule,
    // O cadastro é público: freio por IP, como no recrutamento (o
    // ThrottlerGuard não é global de propósito).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
  ],
  controllers: [
    StoreAdminController,
    StoreCatalogController,
    StoreUserCatalogController,
    StoreSignupController,
    StoreOnboardingController,
    StorePurchaseController,
    StoreAdminPurchaseController,
  ],
  providers: [
    StoreAdminService,
    StoreCatalogService,
    StoreContentRepository,
    StoreSignupService,
    StorePurchaseService,
    ModuleAccessService,
    StoreProductRepository,
    StorePurchaseRepository,
  ],
  exports: [
    StoreProductRepository,
    StorePurchaseRepository,
    StorePurchaseService,
    ModuleAccessService,
  ],
})
export class StoreModule {}
