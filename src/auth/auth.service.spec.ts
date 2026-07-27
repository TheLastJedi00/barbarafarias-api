import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthUser } from './entities/auth-user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: { verify: jest.Mock; sign: jest.Mock };
  let authRepository: { findByEmail: jest.Mock; save: jest.Mock };
  let bcryptService: { transform: jest.Mock; compare: jest.Mock };
  let userRepository: { findById: jest.Mock };

  beforeEach(() => {
    jwtService = { verify: jest.fn(), sign: jest.fn() };
    authRepository = { findByEmail: jest.fn(), save: jest.fn() };
    bcryptService = { transform: jest.fn(), compare: jest.fn() };
    userRepository = { findById: jest.fn().mockResolvedValue(null) };
    service = new AuthService(
      jwtService as any,
      authRepository as any,
      bcryptService as any,
      userRepository as any,
    );
  });

  describe('login', () => {
    it('retorna access_token quando as credenciais são válidas', async () => {
      authRepository.findByEmail.mockResolvedValue(
        new AuthUser({ id: '1', email: 'a@b.com', password: 'hash', role: 'teacher' }),
      );
      bcryptService.compare.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('token-123');

      const result = await service.login('a@b.com', 'senha');

      expect(result).toEqual({ access_token: 'token-123' });
      expect(jwtService.sign).toHaveBeenCalledWith({
        email: 'a@b.com',
        sub: '1',
        role: 'teacher',
      });
    });

    it('o papel de users manda sobre o de credentials', async () => {
      authRepository.findByEmail.mockResolvedValue(
        new AuthUser({ id: '1', email: 'a@b.com', password: 'hash', role: 'teacher' }),
      );
      // promovida em users, credencial ainda com o papel antigo
      userRepository.findById.mockResolvedValue({ id: '1', role: 'manager' });
      bcryptService.compare.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('token-123');

      await service.login('a@b.com', 'senha');

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'manager' }),
      );
    });

    it('usa credentials como ponte enquanto users ainda não tem papel', async () => {
      authRepository.findByEmail.mockResolvedValue(
        new AuthUser({ id: '1', email: 'a@b.com', password: 'hash', role: 'manager' }),
      );
      userRepository.findById.mockResolvedValue({ id: '1' }); // sem role
      bcryptService.compare.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('token-123');

      await service.login('a@b.com', 'senha');

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'manager' }),
      );
    });

    it('cai no isTeacher legado quando não há papel em lugar nenhum', async () => {
      authRepository.findByEmail.mockResolvedValue(
        new AuthUser({ id: '1', email: 'a@b.com', password: 'hash' }),
      );
      userRepository.findById.mockResolvedValue({ id: '1', isTeacher: true });
      bcryptService.compare.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('token-123');

      await service.login('a@b.com', 'senha');

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'teacher' }),
      );
    });

    it('sem nenhuma pista, cai no menor privilégio', async () => {
      authRepository.findByEmail.mockResolvedValue(
        new AuthUser({ id: '1', email: 'a@b.com', password: 'hash' }),
      );
      userRepository.findById.mockResolvedValue(null);
      bcryptService.compare.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('token-123');

      await service.login('a@b.com', 'senha');

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'student' }),
      );
    });

    it('lança Unauthorized quando o usuário não existe', async () => {
      authRepository.findByEmail.mockResolvedValue(null);
      await expect(service.login('x@y.com', 'senha')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('lança Unauthorized quando a senha não confere', async () => {
      authRepository.findByEmail.mockResolvedValue(
        new AuthUser({ id: '1', email: 'a@b.com', password: 'hash', role: 'student' }),
      );
      bcryptService.compare.mockResolvedValue(false);
      await expect(service.login('a@b.com', 'errada')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('verifyToken', () => {
    it('lança Unauthorized quando o token é inválido', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });
      expect(() => service.verifyToken('bad')).toThrow(UnauthorizedException);
    });
  });
});
