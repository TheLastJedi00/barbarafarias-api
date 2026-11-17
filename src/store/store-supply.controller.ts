import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import { StoreSupplyService } from './store-supply.service';

/**
 * Material personalizado de uma compra (spec 033). O dono é sempre o `sub` do
 * token; compra alheia responde 404, vencida 403.
 */
@Controller('store/purchases')
@Roles(ROLES.STUDENT)
export class StoreSupplyController {
  constructor(private readonly service: StoreSupplyService) {}

  /** Abre (ou retoma) uma geração. Gasta uma chance só quando abre. */
  @Post(':id/generation/start')
  @HttpCode(200)
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.start(user.sub, id);
  }
}
