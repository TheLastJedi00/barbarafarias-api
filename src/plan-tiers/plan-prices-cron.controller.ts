import { Controller, Get, Headers } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../decorators/public.decorator';
import { assertCronSecret } from '../common/cron-secret';
import { PlanTierService } from './plan-tier.service';

/**
 * Cron das 00:00 de Brasília (`vercel.json`, `0 3 * * *`): consolida os preços
 * agendados que já venceram (spec 035 §11).
 *
 * É `GET` porque é o que o cron da Vercel chama, e é `@Public()` porque ele
 * não tem token do Firebase — quem protege é o `CRON_SECRET`, que a Vercel
 * envia como `Authorization: Bearer <segredo>`. **Sem o segredo configurado a
 * rota recusa**, nunca aplica sem checar: o mesmo princípio do
 * `MP_WEBHOOK_SECRET`.
 *
 * O preço certo não depende desta rota — a leitura já resolve a vigência. Se o
 * cron atrasar ou falhar, nada é vendido pelo valor errado.
 */
@Controller('internal/cron')
export class PlanPricesCronController {
  constructor(
    private readonly service: PlanTierService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('plan-prices')
  async run(@Headers('authorization') authorization: string | undefined) {
    assertCronSecret(this.config, authorization);
    return { applied: await this.service.applyDuePrices() };
  }
}
