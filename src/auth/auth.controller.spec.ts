import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { REFRESH_COOKIE, SessionCookie } from './session-cookie';

describe('AuthController — sessão em cookie (spec 021)', () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
  };

  const sessao = {
    access_token: 'id-token',
    refresh_token: 'refresh-1',
    expires_in: 3600,
  };

  const makeRes = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });
  const comCookie = (valor?: string) =>
    ({ cookies: valor ? { [REFRESH_COOKIE]: valor } : {} }) as any;

  beforeEach(() => {
    authService = {
      login: jest.fn().mockResolvedValue(sessao),
      refresh: jest.fn().mockResolvedValue({ ...sessao, access_token: 'id-token-2' }),
      logout: jest.fn().mockResolvedValue(undefined),
    };
    // O `SessionCookie` real, e não um dublê: assim o teste do controller
    // também prova que os atributos chegam ao `res`.
    const config = { get: jest.fn().mockReturnValue(undefined) };
    controller = new AuthController(
      authService as any,
      new SessionCookie(config as any),
    );
  });

  describe('login', () => {
    it('grava o refresh no cookie e não o devolve no corpo', async () => {
      const res = makeRes();

      const resposta = await controller.login(
        { email: 'a@b.com', password: 'senha' } as any,
        res as any,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_COOKIE,
        'refresh-1',
        expect.objectContaining({ httpOnly: true, path: '/auth' }),
      );
      // O corpo é a única via pela qual o refresh token chegaria ao
      // JavaScript — devolvê-lo anularia a spec inteira.
      expect(resposta).toEqual({ access_token: 'id-token', expires_in: 3600 });
      expect(resposta).not.toHaveProperty('refresh_token');
    });
  });

  describe('refresh', () => {
    it('usa o cookie e regrava o cookie, renovando o prazo', async () => {
      const res = makeRes();

      const resposta = await controller.refresh(
        comCookie('do-cookie'),
        {} as any,
        res as any,
      );

      expect(authService.refresh).toHaveBeenCalledWith('do-cookie');
      expect(res.cookie).toHaveBeenCalledTimes(1);
      expect(resposta).toEqual({ access_token: 'id-token-2', expires_in: 3600 });
    });

    it('cai no corpo quando ainda não há cookie (front antigo e migração)', async () => {
      const res = makeRes();

      await controller.refresh(
        comCookie(),
        { refresh_token: 'do-corpo' } as any,
        res as any,
      );

      expect(authService.refresh).toHaveBeenCalledWith('do-corpo');
      // E já devolve o cookie: é assim que o `bf.refresh` do `localStorage`
      // vira cookie na primeira carga do front novo.
      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_COOKIE,
        'refresh-1',
        expect.any(Object),
      );
    });

    it('prefere o cookie ao corpo quando os dois vêm', async () => {
      await controller.refresh(
        comCookie('do-cookie'),
        { refresh_token: 'do-corpo' } as any,
        makeRes() as any,
      );

      expect(authService.refresh).toHaveBeenCalledWith('do-cookie');
    });

    it('responde 401, e não 400, quando não há token em lugar nenhum', async () => {
      // Para o front os dois casos são "a sessão acabou". Um 400 escaparia do
      // tratamento de 401 do interceptor e viraria erro de tela.
      await expect(
        controller.refresh(comCookie(), {} as any, makeRes() as any),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(authService.refresh).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('limpa o cookie e revoga as sessões no Firebase', async () => {
      const res = makeRes();

      await controller.logout({ sub: 'uid-1' } as any, res as any);

      expect(res.clearCookie).toHaveBeenCalledWith(
        REFRESH_COOKIE,
        expect.objectContaining({ httpOnly: true, path: '/auth' }),
      );
      expect(authService.logout).toHaveBeenCalledWith('uid-1');
    });

    it('limpa o cookie mesmo se a revogação falhar', async () => {
      // Sair não pode depender da rede. Se o cookie ficasse, a pessoa veria a
      // tela de login achando que saiu — e a sessão continuaria de pé.
      authService.logout.mockRejectedValue(new Error('firebase fora do ar'));
      const res = makeRes();

      await expect(
        controller.logout({ sub: 'uid-1' } as any, res as any),
      ).rejects.toBeDefined();

      expect(res.clearCookie).toHaveBeenCalled();
    });
  });
});
