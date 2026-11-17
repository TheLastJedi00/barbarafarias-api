import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
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

/** A vitrine do aluno logado: filtra o próprio nível e marca o que já é dele. */
@Controller('store/catalog')
@Roles(ROLES.STUDENT)
export class StoreUserCatalogController {
  constructor(private readonly service: StoreCatalogService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listForUser(user);
  }
}
