import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import { StoreSupplyStepDto } from './dto/store-supply.dto';
import { StoreSupplyService } from './store-supply.service';

/**
 * Material personalizado de uma compra (spec 033). O dono é sempre o `sub` do
 * token; compra alheia responde 404, vencida 403.
 */
@Controller('store/purchases')
@Roles(ROLES.STUDENT)
export class StoreSupplyController {
  constructor(private readonly service: StoreSupplyService) {}

  /** Material vigente + geração em andamento + chances. */
  @Get(':id/material')
  material(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.material(user.sub, id);
  }

  /** Abre (ou retoma) uma geração. Gasta uma chance só quando abre. */
  @Post(':id/generation/start')
  @HttpCode(200)
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.start(user.sub, id);
  }

  /** Gera uma etapa. Refazer uma que falhou não gasta geração (teto de 3). */
  @Post(':id/generation/step')
  @HttpCode(200)
  step(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StoreSupplyStepDto,
  ) {
    return this.service.step(user.sub, id, dto.stepId);
  }

  /** Fecha a geração e troca o material vigente. */
  @Post(':id/generation/finish')
  @HttpCode(200)
  finish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.finish(user.sub, id);
  }
}

/** "Acessos vencidos" da gerente (spec 033): material guardado e bloqueado. */
@Controller('store/admin/expired-supplies')
@Roles(ROLES.MANAGER)
export class StoreAdminSupplyController {
  constructor(private readonly service: StoreSupplyService) {}

  @Get()
  list() {
    return this.service.listExpired();
  }

  /** Apaga todos os liberados (30 dias depois do fim). */
  @Post('purge-eligible')
  @HttpCode(200)
  purgeEligible() {
    return this.service.purgeEligible();
  }

  /** Apaga um. 409 antes dos 30 dias ou se o acesso voltou a valer. */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.deleteExpired(id);
  }
}
