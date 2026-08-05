import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { IdentityToolkitError } from './identity-toolkit.client';

describe('AuthService', () => {
  let service: AuthService;
  let auth: {
    verifyIdToken: jest.Mock;
    setCustomUserClaims: jest.Mock;
    revokeRefreshTokens: jest.Mock;
  };
  let identity: {
    signInWithPassword: jest.Mock;
    refresh: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
  };
  let userRepository: { findById: jest.Mock };
  let cooldown: { enforce: jest.Mock };

  const sessao = {
    idToken: 'id-token',
    refreshToken: 'refresh-token',
    expiresIn: 3600,
    localId: 'uid-1',
  };

  beforeEach(() => {
    auth = {
      verifyIdToken: jest.fn().mockResolvedValue({
        uid: 'uid-1',
        email: 'a@b.com',
        role: 'student',
        email_verified: true,
      }),
      setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
      revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
    };
    identity = {
      signInWithPassword: jest.fn().mockResolvedValue(sessao),
      refresh: jest.fn().mockResolvedValue({ ...sessao, idToken: 'id-token-2' }),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };
    userRepository = { findById: jest.fn().mockResolvedValue(null) };
    cooldown = { enforce: jest.fn().mockResolvedValue(undefined) };
    service = new AuthService(
      auth as any,
      identity as any,
      { save: jest.fn(), delete: jest.fn() } as any,
      { transform: jest.fn(), compare: jest.fn() } as any,
      userRepository as any,
      cooldown as any,
    );
  });

  describe('login', () => {
    it('devolve a sessão do Firebase', async () => {
      const result = await service.login('a@b.com', 'senha');

      expect(identity.signInWithPassword).toHaveBeenCalledWith('a@b.com', 'senha');
      expect(result).toEqual({
        access_token: 'id-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
      });
    });

    it('traduz credencial recusada em 401 com a mensagem da tela', async () => {
      identity.signInWithPassword.mockRejectedValue(
        new IdentityToolkitError(
          'INVALID_LOGIN_CREDENTIALS',
          'E-mail ou senha incorretos.',
        ),
      );

      await expect(service.login('a@b.com', 'errada')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('grava o papel ausente e reemite o token, em vez de devolvê-lo sem papel', async () => {
      // Um token sem a claim passaria pelo AuthGuard e morreria no RolesGuard,
      // com 403 em toda tela e nenhuma pista do motivo.
      auth.verifyIdToken.mockResolvedValueOnce({ uid: 'uid-1', email: 'a@b.com' });
      userRepository.findById.mockResolvedValue({ id: 'uid-1', role: 'manager' });

      const result = await service.login('a@b.com', 'senha');

      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('uid-1', {
        role: 'manager',
      });
      expect(identity.refresh).toHaveBeenCalledWith('refresh-token');
      expect(result.access_token).toBe('id-token-2');
    });

    it('resolve o papel pelo isTeacher legado quando users não tem role', async () => {
      auth.verifyIdToken.mockResolvedValueOnce({ uid: 'uid-1', email: 'a@b.com' });
      userRepository.findById.mockResolvedValue({ id: 'uid-1', isTeacher: true });

      await service.login('a@b.com', 'senha');

      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('uid-1', {
        role: 'teacher',
      });
    });

    it('sem nenhuma pista, cai no menor privilégio', async () => {
      auth.verifyIdToken.mockResolvedValueOnce({ uid: 'uid-1', email: 'a@b.com' });
      userRepository.findById.mockResolvedValue(null);

      await service.login('a@b.com', 'senha');

      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('uid-1', {
        role: 'student',
      });
    });

    it('não toca no banco quando o token já traz o papel', async () => {
      await service.login('a@b.com', 'senha');

      expect(userRepository.findById).not.toHaveBeenCalled();
      expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('troca o refresh token por uma sessão nova', async () => {
      const result = await service.refresh('refresh-token');

      expect(identity.refresh).toHaveBeenCalledWith('refresh-token');
      expect(result.access_token).toBe('id-token-2');
    });

    it('devolve 401 quando o refresh token já não vale', async () => {
      identity.refresh.mockRejectedValue(
        new IdentityToolkitError('TOKEN_EXPIRED', 'Sessão expirada. Entre novamente.'),
      );

      await expect(service.refresh('velho')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revoga todas as sessões da pessoa', async () => {
      await service.logout('uid-1');
      expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('uid-1');
    });

    it('não falha quando a revogação falha', async () => {
      // O front já descartou os tokens: transformar isso em erro deixaria a
      // tela presa numa saída que, do ponto de vista dela, já aconteceu.
      auth.revokeRefreshTokens.mockRejectedValue(new Error('rede'));
      await expect(service.logout('uid-1')).resolves.toBeUndefined();
    });
  });

  describe('sendPasswordReset', () => {
    it('pede o e-mail ao Firebase', async () => {
      await service.sendPasswordReset('a@b.com');
      expect(identity.sendPasswordResetEmail).toHaveBeenCalledWith('a@b.com');
    });

    it('respeita o intervalo por endereço antes de enviar', async () => {
      cooldown.enforce.mockRejectedValue(new Error('429'));

      await expect(service.sendPasswordReset('a@b.com')).rejects.toBeDefined();
      expect(identity.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('responde igual para e-mail inexistente', async () => {
      // Responder diferente aqui transformaria a rota num verificador de quem
      // tem conta na escola.
      identity.sendPasswordResetEmail.mockRejectedValue(
        new IdentityToolkitError('EMAIL_NOT_FOUND', 'E-mail ou senha incorretos.'),
      );

      await expect(service.sendPasswordReset('nao@existe.com')).resolves.toBeUndefined();
    });

    it('deixa a falha de infraestrutura subir', async () => {
      // Chave errada engolida como sucesso seria um botão que nunca funciona e
      // nunca reclama.
      identity.sendPasswordResetEmail.mockRejectedValue(
        new IdentityToolkitError('CONFIGURATION_NOT_FOUND', 'Falha na autenticação.'),
      );

      await expect(service.sendPasswordReset('a@b.com')).rejects.toBeDefined();
    });
  });

  describe('verifyIdToken', () => {
    it('monta o usuário do request a partir das claims', async () => {
      const user = await service.verifyIdToken('id-token');

      expect(user).toEqual({
        sub: 'uid-1',
        email: 'a@b.com',
        role: 'student',
        emailVerified: true,
      });
    });

    it('resolve o papel pelo banco quando a claim falta', async () => {
      auth.verifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'a@b.com' });
      userRepository.findById.mockResolvedValue({ id: 'uid-1', role: 'teacher' });

      const user = await service.verifyIdToken('id-token');

      expect(user.role).toBe('teacher');
    });

    it('lança Unauthorized quando o token é inválido', async () => {
      auth.verifyIdToken.mockRejectedValue(new Error('expired'));

      await expect(service.verifyIdToken('bad')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
