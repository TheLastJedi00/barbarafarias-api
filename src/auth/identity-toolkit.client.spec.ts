import {
  IdentityToolkitClient,
  IdentityToolkitError,
  toHttpException,
} from './identity-toolkit.client';
import {
  ConflictException,
  HttpException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

describe('IdentityToolkitClient', () => {
  const config = { get: (key: string) => (key === 'FIREBASE_WEB_API_KEY' ? 'chave' : undefined) };
  let fetchMock: jest.Mock;

  function makeClient() {
    return new IdentityToolkitClient(config as any);
  }

  /** Resposta de sucesso do Identity Toolkit. */
  function ok(body: unknown) {
    return { ok: true, status: 200, json: async () => body };
  }

  /** Resposta de erro no formato que a API do Google devolve. */
  function fail(code: string, status = 400) {
    return {
      ok: false,
      status,
      json: async () => ({ error: { code: status, message: code } }),
    };
  }

  /**
   * Recusa de configuração, no formato real do Google: o motivo legível por
   * máquina não está na `message` — está em `details[].reason` (spec 017).
   */
  function refusar(reason: string, message = 'Requests from referer <empty> are blocked.') {
    return {
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          code: 403,
          message,
          status: 'PERMISSION_DENIED',
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
              reason,
              domain: 'googleapis.com',
              metadata: { service: 'identitytoolkit.googleapis.com' },
            },
          ],
        },
      }),
    };
  }

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  /** Roda o login esperando falha, devolvendo o erro já tipado. */
  async function capturarErro(_contexto?: string): Promise<IdentityToolkitError> {
    try {
      await makeClient().signInWithPassword('a@b.com', 'x');
    } catch (e) {
      return e as IdentityToolkitError;
    }
    throw new Error('esperava falha, mas o login passou');
  }

  describe('signInWithPassword', () => {
    it('devolve os tokens e o uid', async () => {
      fetchMock.mockResolvedValue(
        ok({
          idToken: 'id-token',
          refreshToken: 'refresh-token',
          expiresIn: '3600',
          localId: 'uid-1',
        }),
      );

      const result = await makeClient().signInWithPassword('a@b.com', 'segredo');

      expect(result).toEqual({
        idToken: 'id-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        localId: 'uid-1',
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('accounts:signInWithPassword?key=chave');
      expect(JSON.parse(init.body)).toEqual({
        email: 'a@b.com',
        password: 'segredo',
        returnSecureToken: true,
      });
    });

    it('traduz senha errada e e-mail inexistente para a mesma mensagem', async () => {
      // O Firebase unifica os dois em INVALID_LOGIN_CREDENTIALS quando a
      // proteção contra enumeração de e-mail está ligada: a tela não pode
      // depender de qual dos dois veio.
      const mensagens: string[] = [];
      for (const code of [
        'EMAIL_NOT_FOUND',
        'INVALID_PASSWORD',
        'INVALID_LOGIN_CREDENTIALS',
      ]) {
        fetchMock.mockResolvedValue(fail(code));
        const erro = await capturarErro(code);
        expect(erro).toBeInstanceOf(IdentityToolkitError);
        expect(erro.code).toBe(code);
        mensagens.push(erro.message);
      }
      expect(new Set(mensagens).size).toBe(1);
      expect(mensagens[0]).toBe('E-mail ou senha incorretos.');
    });

    it('ignora o sufixo que o Google anexa ao código', async () => {
      fetchMock.mockResolvedValue(
        fail('WEAK_PASSWORD : Password should be at least 6 characters'),
      );

      const erro = await capturarErro();

      expect(erro.code).toBe('WEAK_PASSWORD');
    });
  });

  describe('refresh', () => {
    it('troca o refresh token por um id token novo', async () => {
      fetchMock.mockResolvedValue(
        ok({
          id_token: 'novo-id',
          refresh_token: 'novo-refresh',
          expires_in: '3600',
          user_id: 'uid-1',
        }),
      );

      const result = await makeClient().refresh('refresh-antigo');

      expect(result).toEqual({
        idToken: 'novo-id',
        refreshToken: 'novo-refresh',
        expiresIn: 3600,
        localId: 'uid-1',
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('securetoken.googleapis.com/v1/token?key=chave');
      expect(init.body.toString()).toContain('grant_type=refresh_token');
    });
  });

  describe('e-mails', () => {
    it('pede ao Firebase o e-mail de redefinição de senha', async () => {
      fetchMock.mockResolvedValue(ok({ email: 'a@b.com' }));

      await makeClient().sendPasswordResetEmail('a@b.com');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('accounts:sendOobCode?key=chave');
      expect(JSON.parse(init.body)).toEqual({
        requestType: 'PASSWORD_RESET',
        email: 'a@b.com',
      });
    });

    it('pede ao Firebase o e-mail de verificação, que é autenticado pelo id token', async () => {
      fetchMock.mockResolvedValue(ok({ email: 'a@b.com' }));

      await makeClient().sendVerificationEmail('id-token');

      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({
        requestType: 'VERIFY_EMAIL',
        idToken: 'id-token',
      });
    });
  });

  describe('recusa por configuração (spec 017)', () => {
    // O bug que originou a spec: a chave tinha restrição de HTTP referrer e o
    // backend chama sem `Referer`. O código vinha da `message` inteira
    // ("Requests from referer <empty> are blocked."), não batia com nada e o
    // login virava um 500 que mandava "tente novamente" — conselho errado,
    // porque nenhuma tentativa ia passar.
    it('reconhece chave bloqueada por restrição de aplicativo', async () => {
      fetchMock.mockResolvedValue(refusar('API_KEY_HTTP_REFERRER_BLOCKED'));

      const erro = await capturarErro();

      expect(erro.code).toBe('CONFIG_API_KEY_BLOCKED');
      expect(erro.message).not.toMatch(/senha/i);
    });

    it('reconhece os demais motivos que o Google devolve em details[].reason', async () => {
      const casos: Record<string, string> = {
        API_KEY_IP_ADDRESS_BLOCKED: 'CONFIG_API_KEY_BLOCKED',
        API_KEY_INVALID: 'CONFIG_API_KEY_INVALID',
        // A restrição de API que a spec passou a recomendar tem o seu próprio
        // jeito de dar errado: chave certa, API de fora da lista.
        API_KEY_SERVICE_BLOCKED: 'CONFIG_API_KEY_SERVICE_BLOCKED',
        SERVICE_DISABLED: 'CONFIG_API_DISABLED',
      };
      for (const [reason, esperado] of Object.entries(casos)) {
        fetchMock.mockResolvedValue(refusar(reason));
        expect((await capturarErro(reason)).code).toBe(esperado);
      }
    });

    it('cai num código próprio quando o PERMISSION_DENIED não traz motivo conhecido', async () => {
      fetchMock.mockResolvedValue(refusar('MOTIVO_QUE_AINDA_NAO_EXISTE'));

      expect((await capturarErro()).code).toBe('CONFIG_PERMISSION_DENIED');
    });

    it('registra no log a variável a conferir, e não só o corpo cru', async () => {
      const logger = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      fetchMock.mockResolvedValue(refusar('API_KEY_HTTP_REFERRER_BLOCKED'));

      await capturarErro();

      // Sem o nome da variável, o log diz o que aconteceu mas não onde mexer.
      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining('FIREBASE_WEB_API_KEY'),
      );
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('referer'));
      logger.mockRestore();
    });

    it('não confunde credencial recusada com problema de configuração', async () => {
      fetchMock.mockResolvedValue(fail('INVALID_LOGIN_CREDENTIALS'));

      expect((await capturarErro()).code).toBe('INVALID_LOGIN_CREDENTIALS');
    });
  });

  it('falha claro quando a chave da Web API não está configurada', async () => {
    const semChave = new IdentityToolkitClient({ get: () => undefined } as any);

    await expect(semChave.signInWithPassword('a@b.com', 'x')).rejects.toThrow(
      /FIREBASE_WEB_API_KEY/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('toHttpException', () => {
  function status(code: string): number {
    const exception = toHttpException(new IdentityToolkitError(code, 'mensagem'));
    return (exception as HttpException).getStatus();
  }

  it('trata credencial recusada como 401', () => {
    expect(status('INVALID_LOGIN_CREDENTIALS')).toBe(401);
    expect(status('USER_DISABLED')).toBe(401);
    expect(status('TOKEN_EXPIRED')).toBe(401);
    expect(toHttpException(new IdentityToolkitError('EMAIL_NOT_FOUND', 'm'))).toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('trata excesso de tentativas como 429 e e-mail em uso como 409', () => {
    expect(status('TOO_MANY_ATTEMPTS_TRY_LATER')).toBe(429);
    expect(toHttpException(new IdentityToolkitError('EMAIL_EXISTS', 'm'))).toBeInstanceOf(
      ConflictException,
    );
  });

  it('trata erro de configuração como 503, não como 500 com "tente novamente"', () => {
    // Chave errada, projeto sem provedor de senha, API fora: engolir isso como
    // "senha incorreta" esconderia um erro de configuração atrás de uma tela
    // de login que simplesmente nunca funciona. E 500 "tente novamente" é pior
    // que inútil aqui — instrui a repetir uma ação que não tem como passar
    // enquanto ninguém mexer na configuração (spec 017).
    for (const code of [
      'CONFIG_API_KEY_BLOCKED',
      'CONFIG_API_KEY_INVALID',
      'CONFIG_API_KEY_SERVICE_BLOCKED',
      'CONFIG_API_DISABLED',
      'CONFIG_PERMISSION_DENIED',
      'CONFIGURATION_NOT_FOUND',
    ]) {
      expect(
        toHttpException(new IdentityToolkitError(code, 'm')),
      ).toBeInstanceOf(ServiceUnavailableException);
      expect(status(code)).toBe(503);
    }
  });

  it('mantém em 500 o que não se sabe classificar', () => {
    expect(status('UM_CODIGO_NOVO_DO_GOOGLE')).toBe(500);
  });
});
