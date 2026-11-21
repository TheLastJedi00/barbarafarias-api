import { Module } from '@nestjs/common';
import { PlanTierController } from './plan-tier.controller';
import { PlanPricesCronController } from './plan-prices-cron.controller';
import { PlanTierRepository } from './plan-tier.repository';
import { PlanTierService } from './plan-tier.service';

/**
 * Tiers de plano (spec 035): catálogo editável pela gerente, preço com
 * vigência às 00:00 de Brasília e a vitrine pública com cache.
 *
 * Exporta o serviço porque a assinatura lê o preço efetivo na contratação.
 */
@Module({
  controllers: [PlanTierController, PlanPricesCronController],
  providers: [PlanTierService, PlanTierRepository],
  exports: [PlanTierService],
})
export class PlanTierModule {}
