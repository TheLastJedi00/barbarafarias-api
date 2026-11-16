import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { StoreCatalogService } from './store-catalog.service';

/**
 * Vitrine **pública** da loja (spec 032 §8): alimenta a seção da landing e a
 * página de produto antes do login. Só o que está publicado, sem conteúdo.
 */
@Controller('store/products')
@Public()
export class StoreCatalogController {
  constructor(private readonly service: StoreCatalogService) {}

  @Get()
  list() {
    return this.service.listPublished();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getPublished(id);
  }
}
