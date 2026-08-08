import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

/** Nome do cookie que guarda o refresh token (spec 021). */
export const REFRESH_COOKIE = 'bf_refresh';

/**
 * Quanto tempo o **navegador** guarda o cookie. É política de sessão, não
 * proteção: o refresh token do Firebase não expira nem rotaciona, então um
 * token exfiltrado vale para sempre com ou sem este prazo (spec 021 §6).
 *
 * Reescrito a cada `/auth/refresh`: quem usa toda semana nunca é deslogado;
 * quem some por um mês precisa entrar de novo.
 */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Gravar, ler e limpar o cookie de sessão — os três num lugar só.
 *
 * **Por que centralizar:** `clearCookie` só apaga o cookie se os atributos
 * baterem com os do `cookie` que o criou. Espalhados por três rotas, eles
 * divergem no primeiro ajuste, e o sintoma é o pior possível: "sair" deixa de
 * sair, e a pessoa vê a tela de login achando que a sessão acabou.
 */
@Injectable()
export class SessionCookie {
  constructor(private readonly config: ConfigService) {}

  set(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.options(),
      maxAge: MAX_AGE_MS,
    });
  }

  clear(res: Response): void {
    // Sem `maxAge`: o próprio `clearCookie` cuida da expiração no passado. Os
    // demais atributos precisam ser idênticos aos do `set` — ver o teste.
    res.clearCookie(REFRESH_COOKIE, this.options());
  }

  /** Tolerante à ausência: quem decide o que fazer com ela é o controller. */
  read(req: Request): string | undefined {
    return req.cookies?.[REFRESH_COOKIE];
  }

  private options(): CookieOptions {
    return {
      // O ponto da spec 021: fora do alcance de qualquer script na página.
      httpOnly: true,
      /*
       * Derivado de `DEV_MODE`, e não de `NODE_ENV`, de propósito (spec 021
       * §7.3): `NODE_ENV` não é lida em nenhum outro ponto deste backend, e se
       * viesse vazia o cookie sairia **sem Secure em produção**, em silêncio.
       * Assim o padrão é o seguro e o inseguro exige opt-in explícito.
       */
      secure: this.config.get<string>('DEV_MODE') !== 'true',
      /*
       * `Lax` basta porque front e API são same-site nos três ambientes
       * (produção, dev e localhost). É também o que dispensa token de CSRF:
       * ele bloqueia o POST cross-site. Virar `None` reabre essa necessidade.
       */
      sameSite: 'lax',
      // Só `/auth/refresh` e `/auth/logout` precisam do cookie.
      path: '/auth',
    };
  }
}
