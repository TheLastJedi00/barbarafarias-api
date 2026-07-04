import { NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.entity';

describe('UserService', () => {
  let service: UserService;
  let userRepository: {
    findById: jest.Mock;
    update: jest.Mock;
    save: jest.Mock;
  };
  let authService: { registerCredentials: jest.Mock };

  beforeEach(() => {
    userRepository = {
      findById: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue('uid-1'),
    };
    authService = { registerCredentials: jest.fn().mockResolvedValue(undefined) };
    service = new UserService(userRepository as any, authService as any);
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
