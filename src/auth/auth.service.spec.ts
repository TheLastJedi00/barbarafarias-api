import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { AuthRepository } from './auth.repository';
import { BcryptService } from './bcrypt.service';
import { UnauthorizedException } from '@nestjs/common';
import * as admin from 'firebase-admin';

jest.mock('firebase-admin', () => {
  return {
    auth: jest.fn().mockReturnValue({
      verifyIdToken: jest.fn(),
    }),
  };
});

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let authRepository: jest.Mocked<AuthRepository>;
  let bcryptService: jest.Mocked<BcryptService>;

  beforeEach(async () => {
    const mockJwtService = {
      sign: jest.fn(),
    };
    const mockAuthRepository = {
      save: jest.fn(),
      findByEmail: jest.fn(),
    };
    const mockBcryptService = {
      transform: jest.fn(),
      compare: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: AuthRepository, useValue: mockAuthRepository },
        { provide: BcryptService, useValue: mockBcryptService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get(JwtService);
    authRepository = module.get(AuthRepository);
    bcryptService = module.get(BcryptService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyToken', () => {
    it('should return decoded token if valid', async () => {
      const mockDecodedToken = { uid: '123' };
      (admin.auth().verifyIdToken as jest.Mock).mockResolvedValue(mockDecodedToken);

      const result = await service.verifyToken('valid-token');

      expect(result).toEqual(mockDecodedToken);
      expect(admin.auth().verifyIdToken).toHaveBeenCalledWith('valid-token');
    });

    it('should throw UnauthorizedException if token is invalid', async () => {
      (admin.auth().verifyIdToken as jest.Mock).mockRejectedValue(new Error('Invalid token'));

      await expect(service.verifyToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('registerCredentials', () => {
    it('should hash password and save auth user', async () => {
      bcryptService.transform.mockResolvedValue('hashed_pw');
      authRepository.save.mockResolvedValue();

      await service.registerCredentials({ email: 'test@test.com', password: 'plain', role: 'student' });

      expect(bcryptService.transform).toHaveBeenCalledWith('plain');
      expect(authRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('login', () => {
    it('should return access token if credentials are valid', async () => {
      const authUser = { id: '1', email: 'test@test.com', password: 'hashed_pw', role: 'student' } as any;
      authRepository.findByEmail.mockResolvedValue(authUser);
      bcryptService.compare.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('jwt-token');

      const result = await service.login('test@test.com', 'plain');

      expect(result).toEqual({ access_token: 'jwt-token' });
      expect(authRepository.findByEmail).toHaveBeenCalledWith('test@test.com');
      expect(bcryptService.compare).toHaveBeenCalledWith('plain', 'hashed_pw');
      expect(jwtService.sign).toHaveBeenCalledWith({ email: 'test@test.com', sub: '1', role: 'student' });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      authRepository.findByEmail.mockResolvedValue(null);

      await expect(service.login('test@test.com', 'plain')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      const authUser = { id: '1', email: 'test@test.com', password: 'hashed_pw' } as any;
      authRepository.findByEmail.mockResolvedValue(authUser);
      bcryptService.compare.mockResolvedValue(false);

      await expect(service.login('test@test.com', 'wrong_pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
