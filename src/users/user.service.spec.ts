import { NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.entity';

describe('UserService', () => {
  let service: UserService;
  let userRepository: {
    findById: jest.Mock;
    update: jest.Mock;
    save: jest.Mock;
    findAll: jest.Mock;
  };
  let authService: {
    registerCredentials: jest.Mock;
    removeCredentials: jest.Mock;
  };

  beforeEach(() => {
    userRepository = {
      findById: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue('uid-1'),
      findAll: jest.fn().mockResolvedValue([]),
    };
    authService = {
      registerCredentials: jest.fn().mockResolvedValue(undefined),
      removeCredentials: jest.fn().mockResolvedValue(undefined),
    };
    service = new UserService(userRepository as any, authService as any);
  });

  describe('createUser', () => {
    const dto = {
      fullName: 'Ana',
      email: 'ana@x.com',
      password: 'senha',
      isTeacher: false,
    } as any;

    it('registra credencial e persiste o usuário', async () => {
      const result = await service.createUser(dto);
      expect(authService.registerCredentials).toHaveBeenCalledTimes(1);
      expect(userRepository.save).toHaveBeenCalledTimes(1);
      expect(result.fullName).toBe('Ana');
    });

    it('faz rollback da credencial se a gravação do usuário falhar', async () => {
      userRepository.save.mockRejectedValue(new Error('firestore down'));
      await expect(service.createUser(dto)).rejects.toThrow('firestore down');
      expect(authService.removeCredentials).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAllUsers', () => {
    it('repassa o papel "student" ao repositório (garante que teachers não vazam)', async () => {
      const alunos = [new User({ id: 'a1', fullName: 'Ana', isTeacher: false })];
      userRepository.findAll.mockResolvedValue(alunos);

      const result = await service.getAllUsers('student');

      expect(userRepository.findAll).toHaveBeenCalledWith('student');
      expect(result).toBe(alunos);
    });

    it('sem papel, delega a busca sem filtro', async () => {
      await service.getAllUsers();
      expect(userRepository.findAll).toHaveBeenCalledWith(undefined);
    });
  });

  describe('updateUser', () => {
    it('lança NotFound quando o usuário não existe', async () => {
      userRepository.findById.mockResolvedValue(null);
      await expect(service.updateUser('id-1', {} as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('faz merge parcial preservando campos e fixa o id do param', async () => {
      userRepository.findById.mockResolvedValue(
        new User({
          id: 'route-id',
          fullName: 'Ana',
          email: 'ana@x.com',
          level: 'A1',
        }),
      );

      const result = await service.updateUser('route-id', {
        fullName: 'Ana Maria',
      } as any);

      // preserva email/level e aplica a alteração
      expect(result.email).toBe('ana@x.com');
      expect(result.level).toBe('A1');
      expect(result.fullName).toBe('Ana Maria');
      // usa o id da rota, não o do corpo
      expect(result.id).toBe('route-id');
      expect(userRepository.update).toHaveBeenCalledTimes(1);
    });
  });
});
