import { Module } from '@nestjs/common';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { UploadModule } from '../uploads/upload.module';
import { StoreAdminController } from './store-admin.controller';
import { StoreAdminService } from './store-admin.service';
import { StoreCatalogController } from './store-catalog.controller';
import { StoreCatalogService } from './store-catalog.service';
import { StoreContentRepository } from './store-content.repository';
import { StoreProductRepository } from './store-product.repository';
import { StorePurchaseRepository } from './store-purchase.repository';

/**
 * Loja de módulos avulsos (spec 032): catálogo, compra e acesso por módulo.
 *
 * Não importa o módulo de vídeo aulas — é ele que vai consultar a loja para
 * decidir o acesso, e a dependência no sentido contrário seria circular.
 */
@Module({
  imports: [CurriculumModule, UploadModule],
  controllers: [StoreAdminController, StoreCatalogController],
  providers: [
    StoreAdminService,
    StoreCatalogService,
    StoreContentRepository,
    StoreProductRepository,
    StorePurchaseRepository,
  ],
  exports: [StoreProductRepository, StorePurchaseRepository],
})
export class StoreModule {}
