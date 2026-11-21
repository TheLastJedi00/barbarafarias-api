import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { PlanTierRepository } from './plan-tier.repository';
import {
  effectiveTier,
  isPlanTierId,
  isSellable,
  nextPriceEffectiveAt,
  publicTierView,
  type PlanTier,
  type PlanTierId,
  type PublicPlanTier,
} from './plan-tier.model';
import type { UpdatePlanTierDto } from './dto/plan-tier.dto';

/**
 * Catálogo dos tiers de plano (spec 035).
 *
 * **Preço nunca muda na hora.** A gerente altera, o valor fica agendado para a
 * próxima meia-noite de Brasília, e quem decide se já vale é `effectiveTier` a
 * cada leitura — o cron das 00:00 só consolida o documento.
 */
@Injectable()
export class PlanTierService {
  private readonly logger = new Logger(PlanTierService.name);

  constructor(private readonly tiers: PlanTierRepository) {}

  /** A vitrine: só o que está à venda, sem nada interno. */
  async listPublic(now: Date = new Date()): Promise<PublicPlanTier[]> {
    const tiers = await this.tiers.listAll();
    return tiers
      .map((tier) => effectiveTier(tier, now))
      .filter(isSellable)
      .map(publicTierView);
  }

  /** A gerente: os três, com o agendado ainda pendente. */
  async listAll(now: Date = new Date()): Promise<PlanTier[]> {
    const tiers = await this.tiers.listAll();
    return tiers.map((tier) => effectiveTier(tier, now));
  }

  /** O tier com o preço que vale agora — o que a cobrança usa. */
  async getEffective(
    id: PlanTierId,
    now: Date = new Date(),
  ): Promise<PlanTier> {
    if (!isPlanTierId(id)) {
      throw new BadRequestException('Plano inválido');
    }
    return effectiveTier(await this.tiers.get(id), now);
  }

  async update(
    id: PlanTierId,
    dto: UpdatePlanTierDto,
    user: AuthenticatedUser,
    now: Date = new Date(),
  ): Promise<PlanTier> {
    const tier = await this.require(id, now);

    if (dto.name !== undefined) tier.name = dto.name.trim();
    if (dto.description !== undefined)
      tier.description = dto.description.trim();
    if (dto.benefits !== undefined) {
      tier.benefits = dto.benefits.map((item) => item.trim()).filter(Boolean);
    }
    if (dto.active !== undefined) tier.active = dto.active;

    const mexeuNoPreco =
      dto.packagePrice !== undefined || dto.monthlyPrice !== undefined;
    if (mexeuNoPreco) {
      // A base de cada preço é o agendado, se houver: alterar só a mensalidade
      // não pode desfazer o pacote que a gerente agendou mais cedo.
      const packagePrice =
        dto.packagePrice !== undefined
          ? dto.packagePrice
          : (tier.pending?.packagePrice ?? tier.packagePrice);
      const monthlyPrice =
        dto.monthlyPrice !== undefined
          ? dto.monthlyPrice
          : tier.pending
            ? tier.pending.monthlyPrice
            : tier.monthlyPrice;

      const igualAoVigente =
        packagePrice === tier.packagePrice &&
        monthlyPrice === tier.monthlyPrice;

      tier.pending = igualAoVigente
        ? null
        : {
            packagePrice,
            monthlyPrice,
            effectiveAt: nextPriceEffectiveAt(now).toISOString(),
            requestedBy: user.sub,
            requestedAt: now.toISOString(),
          };
    }

    tier.updatedAt = now.toISOString();
    tier.updatedBy = user.sub;
    await this.tiers.save(tier);
    return tier;
  }

  /** Desfaz o preço agendado antes de ele entrar em vigor. */
  async cancelPending(
    id: PlanTierId,
    user: AuthenticatedUser,
    now: Date = new Date(),
  ): Promise<PlanTier> {
    const stored = await this.requireStored(id);
    if (!stored.pending) return effectiveTier(stored, now);
    if (stored.pending.effectiveAt <= now.toISOString()) {
      throw new BadRequestException(
        'Este preço já entrou em vigor. Agende um novo preço para alterá-lo.',
      );
    }

    stored.pending = null;
    stored.updatedAt = now.toISOString();
    stored.updatedBy = user.sub;
    await this.tiers.save(stored);
    return stored;
  }

  /**
   * O cron das 00:00: grava no documento o preço agendado que já venceu e o
   * registra no histórico. Idempotente — o pendente sai na mesma gravação.
   */
  async applyDuePrices(now: Date = new Date()): Promise<PlanTierId[]> {
    const aplicados: PlanTierId[] = [];
    for (const stored of await this.tiers.listAll()) {
      const pending = stored.pending;
      if (!pending || pending.effectiveAt > now.toISOString()) continue;

      const tier = effectiveTier(stored, now);
      tier.updatedAt = now.toISOString();
      await this.tiers.save(tier);
      await this.tiers.addHistory(tier.id, {
        packagePrice: pending.packagePrice,
        monthlyPrice: pending.monthlyPrice,
        effectiveAt: pending.effectiveAt,
        requestedBy: pending.requestedBy,
        appliedAt: now.toISOString(),
      });
      aplicados.push(tier.id);
    }

    if (aplicados.length) {
      this.logger.log(`Preços aplicados: ${aplicados.join(', ')}`);
    }
    return aplicados;
  }

  private async requireStored(id: PlanTierId): Promise<PlanTier> {
    if (!isPlanTierId(id)) {
      throw new NotFoundException('Plano não encontrado');
    }
    return this.tiers.get(id);
  }

  /** O documento com o vencido já aplicado — editar parte do que vale agora. */
  private async require(id: PlanTierId, now: Date): Promise<PlanTier> {
    return effectiveTier(await this.requireStored(id), now);
  }
}
