import {
  BadRequestException,
  ConflictException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { IdentityToolkitError } from './identity-toolkit.client';

describe('AuthService', () => {
  let service: AuthService;
  let auth: {
    verifyIdToken: jest.Mock;
    setCustomUserClaims: jest.Mock;
    revokeRefreshTokens: jest.Mock;
    createUser: jest.Mock;
    deleteUser: jest.Mock;
    updateUser: jest.Mock;
  };
  let identity: {
    signInWithPassword: jest.Mock;
    refresh: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
    sendVerificationEmail: jest.Mock;
  };
  let userRepository: { findById: jest.Mock; update: jest.Mock };
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
      createUser: jest.fn().mockResolvedValue({ uid: 'uid-1' }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
      updateUser: jest.fn().mockResolvedValue(undefined),
    };
    identity = {
      signInWithPassword: jest.fn().mockResolvedValue(sessao),
      refresh: jest.fn().mockResolvedValue({ ...sessao, idToken: 'id-token-2' }),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };
    userRepository = {
      findById: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
    };
    cooldown = { enforce: jest.fn().mockResolvedValue(undefined) };
    service = new AuthService(
      auth as any,
      identity as any,
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

    it('acusa descasamento de projeto quando o Admin SDK recusa o token recém-emitido', async () => {
      // Login aceito pelo Identity Toolkit e token recusado logo em seguida só
      // acontece por um motivo: a FIREBASE_WEB_API_KEY é de um projeto e o
      // service account é de outro, então o `aud` não bate. Foi assim que a
      // spec 017 começou, e sem esta mensagem o erro reaparece como
      // "Token inválido" — que manda procurar no lugar errado.
      const logger = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      auth.verifyIdToken.mockRejectedValueOnce(
        new Error('Firebase ID token has incorrect "aud" (audience) claim.'),
      );

      await expect(service.login('a@b.com', 'senha')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining('FIREBASE_SERVICE_ACCOUNT_BASE64'),
      );
      logger.mockRestore();
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

  describe('createAccount', () => {
    const conta = {
      uid: 'uid-1',
      email: 'a@b.com',
      password: 'segredo',
      role: 'student' as const,
    };

    it('cria a conta com o papel na claim e dispara a verificação', async () => {
      await service.createAccount(conta);

      expect(auth.createUser).toHaveBeenCalledWith({
        uid: 'uid-1',
        email: 'a@b.com',
        password: 'segredo',
      });
      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('uid-1', {
        role: 'student',
      });
      expect(identity.sendVerificationEmail).toHaveBeenCalledWith('id-token');
    });

    it('recusa e-mail já usado com 409, em vez de deixar o erro cru subir', async () => {
      // A coleção `credentials` aceitava duplicata calada; o Firebase não. Sem
      // esta tradução, a tela de cadastro mostraria um erro do SDK.
      auth.createUser.mockRejectedValue({ code: 'auth/email-already-exists' });

      await expect(service.createAccount(conta)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('recusa senha curta com 400', async () => {
      auth.createUser.mockRejectedValue({ code: 'auth/invalid-password' });

      await expect(service.createAccount(conta)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('não derruba o cadastro quando o e-mail de verificação falha', async () => {
      // A gerente cadastrando um aluno na frente dele não pode perder o
      // cadastro porque o e-mail não saiu.
      identity.sendVerificationEmail.mockRejectedValue(new Error('smtp'));

      await expect(service.createAccount(conta)).resolves.toBeUndefined();
      expect(auth.createUser).toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    it('apaga a conta', async () => {
      await service.deleteAccount('uid-1');
      expect(auth.deleteUser).toHaveBeenCalledWith('uid-1');
    });

    it('trata conta já ausente como sucesso', async () => {
      // É chamada tanto no rollback quanto na exclusão: nos dois casos o que
      // importa é a conta não existir no fim.
      auth.deleteUser.mockRejectedValue({ code: 'auth/user-not-found' });

      await expect(service.deleteAccount('uid-1')).resolves.toBeUndefined();
    });

    it('deixa subir qualquer outra falha', async () => {
      auth.deleteUser.mockRejectedValue({ code: 'auth/internal-error' });

      await expect(service.deleteAccount('uid-1')).rejects.toBeDefined();
    });
  });

  describe('changeEmail', () => {
    it('confere a senha, atualiza os dois lados e pede verificação', async () => {
      await service.changeEmail('uid-1', 'velho@b.com', 'novo@b.com', 'segredo');

      expect(identity.signInWithPassword).toHaveBeenCalledWith(
        'velho@b.com',
        'segredo',
      );
      expect(auth.updateUser).toHaveBeenCalledWith('uid-1', {
        email: 'novo@b.com',
        emailVerified: false,
      });
      expect(userRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'uid-1', email: 'novo@b.com' }),
      );
    });

    it('recusa quando a senha atual não confere', async () => {
      identity.signInWithPassword.mockRejectedValue(
        new IdentityToolkitError(
          'INVALID_LOGIN_CREDENTIALS',
          'E-mail ou senha incorretos.',
        ),
      );

      await expect(
        service.changeEmail('uid-1', 'velho@b.com', 'novo@b.com', 'errada'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auth.updateUser).not.toHaveBeenCalled();
    });

    it('recusa e-mail já usado por outra conta', async () => {
      auth.updateUser.mockRejectedValue({ code: 'auth/email-already-exists' });

      await expect(
        service.changeEmail('uid-1', 'velho@b.com', 'novo@b.com', 'segredo'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('desfaz no Firebase quando o documento não grava', async () => {
      // Sem este rollback, `users.email` ficaria apontando para um endereço
      // com o qual ninguém consegue entrar — a pessoa trancada fora da conta.
      userRepository.update.mockRejectedValue(new Error('firestore fora'));

      await expect(
        service.changeEmail('uid-1', 'velho@b.com', 'novo@b.com', 'segredo'),
      ).rejects.toThrow('firestore fora');
      expect(auth.updateUser).toHaveBeenLastCalledWith('uid-1', {
        email: 'velho@b.com',
        emailVerified: true,
      });
    });
  });

  describe('resendVerification', () => {
    it('reenvia usando o id token de quem pediu', async () => {
      await service.resendVerification('id-token', 'a@b.com');

      expect(cooldown.enforce).toHaveBeenCalledWith('a@b.com');
      expect(identity.sendVerificationEmail).toHaveBeenCalledWith('id-token');
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
