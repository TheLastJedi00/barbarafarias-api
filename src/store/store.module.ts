import { Module } from '@nestjs/common';
import { StoreProductRepository } from './store-product.repository';
import { StorePurchaseRepository } from './store-purchase.repository';

/**
 * Loja de módulos avulsos (spec 032): catálogo, compra e acesso por módulo.
 *
 * Não importa o módulo de vídeo aulas — é ele que vai consultar a loja para
 * decidir o acesso, e a dependência no sentido contrário seria circular.
 */
@Module({
  providers: [StoreProductRepository, StorePurchaseRepository],
  exports: [StoreProductRepository, StorePurchaseRepository],
})
export class StoreModule {}
