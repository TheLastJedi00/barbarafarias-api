import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import { PlanTierService } from './plan-tier.service';
import { UpdatePlanTierDto } from './dto/plan-tier.dto';
import {
  cacheSecondsUntilPriceChange,
  type PlanTierId,
} from './plan-tier.model';

/** Tiers de plano (spec 035). */
@Controller('plan-tiers')
export class PlanTierController {
  constructor(private readonly service: PlanTierService) {}

  /**
   * A vitrine das landings e de Meu Plano. Pública, como qualquer página de
   * preços, e **guardada no CDN** até a próxima meia-noite de Brasília (teto de
   * 1 h): o preço só muda na virada, então nenhuma cópia passa dela com o valor
   * velho, e a função não acorda a cada visita (§11).
   */
  @Public()
  @Get()
  async listPublic(@Res({ passthrough: true }) res: Response) {
    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${cacheSecondsUntilPriceChange()}, stale-while-revalidate=60`,
    );
    return this.service.listPublic();
  }

  /** Sem cache: a gerente precisa ver o agendado na hora em que salva. */
  @Get('all')
  @Roles(ROLES.MANAGER)
  listAll() {
    return this.service.listAll();
  }

  @Patch(':id')
  @Roles(ROLES.MANAGER)
  update(
    @Param('id') id: PlanTierId,
    @Body() dto: UpdatePlanTierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id/pending')
  @Roles(ROLES.MANAGER)
  cancelPending(
    @Param('id') id: PlanTierId,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.cancelPending(id, user);
  }
}
