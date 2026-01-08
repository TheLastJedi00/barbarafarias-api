import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from '../application/user.service';
import { User } from '../domain/user.model'; 
import { ConflictException } from '@nestjs/common';
import * as admin from 'firebase-admin'; 
import { ResponseUserDto } from '../application/dto/ResponseUser.dto';

// 1. Mock do Repositório
const mockUserRepository = {
  save: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
};

// 2. Mock do Firebase Auth
const mockAuth = {
  createUser: jest.fn(),
  setCustomUserClaims: jest.fn(),
};

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Intercepta qualquer chamada ao admin.auth() e devolve objeto falso
    jest.spyOn(admin, 'auth').mockReturnValue(mockAuth as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: 'UserRepository',
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    const dto = {
      fullName: 'Leno Borges',
      email: 'leno@test.com',
      password: 'secretPassword',
      isTeacher: true,
      isPaying: true,
      level: 'A1',
      phone: '123456789',
      objectives: 'Fluency',
      prognosis: 'Good',
    };

    const mockUid = 'firebase_uid_123';

    const response = new ResponseUserDto (
      mockUid,
      'Leno Borges',
    );

    it('deve criar usuário no Auth e salvar no Firestore', async () => {
      // Arrange
      const mockUid = 'firebase_uid_123';
      
      // Simulam que o Firebase Auth criou com sucesso e retornou o UID
      mockAuth.createUser.mockResolvedValue({ uid: mockUid });
      mockUserRepository.save.mockResolvedValue(mockUid);

      // Act
      const result = await service.createUser(dto as any);

      // Assert
      // 1. Verifica se chamou o Auth
      expect(mockAuth.createUser).toHaveBeenCalledTimes(1);

      // 2. Verifica se salvou no repo COM O UID DO FIREBASE
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.any(User),
        mockUid
      );

      // 3. Verifica o retorno
      expect(result).toEqual(response);
    });

    it('deve falhar se o email já existir no Auth (Erro do Firebase)', async () => {
      // Arrange
      const firebaseError = { code: 'auth/email-already-exists' };
      mockAuth.createUser.mockRejectedValue(firebaseError);

      // Act & Assert
      await expect(service.createUser(dto as any))
        .rejects
        .toThrow();

      // NÃO PODE salvar no banco se o Auth falhou
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('deve retornar um usuário se encontrado', async () => {
      const mockUser = new User('Leno', 'phone', 'email', true, true, 'level', 'obj', 'prog', '123');
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await service.findById('123');

      expect(result).toBe(mockUser);
      expect(mockUserRepository.findById).toHaveBeenCalledWith('123');
    });

    it('deve retornar NotFoundException se não encontrado', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(service.findById('nonexistent_id'))
        .rejects
        .toThrow('User not found');
    });
  });
});