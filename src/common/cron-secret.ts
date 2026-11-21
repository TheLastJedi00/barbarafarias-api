import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

/**
 * Confere o `Authorization: Bearer <CRON_SECRET>` que o cron da Vercel envia
 * (specs 035 e 036). **Sem o segredo configurado, recusa (503)** — nunca roda
 * sem checar, o mesmo princípio do `MP_WEBHOOK_SECRET`. Comparação em tempo
 * constante.
 */
export function assertCronSecret(
  config: Pick<ConfigService, 'get'>,
  authorization: string | undefined,
): void {
  const secret = config.get<string>('CRON_SECRET');
  if (!secret) {
    throw new ServiceUnavailableException('CRON_SECRET não configurado');
  }
  if (!matches(authorization, `Bearer ${secret}`)) {
    throw new UnauthorizedException();
  }
}

function matches(received: string | undefined, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
