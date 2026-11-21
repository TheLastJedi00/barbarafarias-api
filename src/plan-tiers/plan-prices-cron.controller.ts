import {
  Controller,
  Get,
  Headers,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../decorators/public.decorator';
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
    const secret = this.config.get<string>('CRON_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException('CRON_SECRET não configurado');
    }
    if (!matches(authorization, `Bearer ${secret}`)) {
      throw new UnauthorizedException();
    }
    return { applied: await this.service.applyDuePrices() };
  }
}

function matches(received: string | undefined, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
