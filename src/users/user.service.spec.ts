import { NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.entity';
import { ROLES, resolveRole } from '../types/role';

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

  describe('getUsersForRequester (spec 011 RF2.1)', () => {
    const base = [
      new User({ id: 's1', fullName: 'Aluno da Ana', role: ROLES.STUDENT, teacherId: 't1' }),
      new User({ id: 's2', fullName: 'Aluno da Bia', role: ROLES.STUDENT, teacherId: 't2' }),
      new User({ id: 's3', fullName: 'Sem professora', role: ROLES.STUDENT }),
      new User({ id: 't2', fullName: 'Bia', role: ROLES.TEACHER }),
    ];

    const manager = { sub: 'm1', email: 'g@x.com', role: ROLES.MANAGER } as any;
    const teacher = { sub: 't1', email: 't@x.com', role: ROLES.TEACHER } as any;

    beforeEach(() => userRepository.findAll.mockResolvedValue(base));

    it('a gerente recebe a base inteira', async () => {
      const users = await service.getUsersForRequester(manager);
      expect(users).toHaveLength(4);
    });

    it('a professora só vê os alunos vinculados a ela', async () => {
      const users = await service.getUsersForRequester(teacher);
      const students = users.filter((u) => resolveRole(u) === ROLES.STUDENT);

      expect(students.map((u) => u.id)).toEqual(['s1']);
    });

    it('a professora não vê aluno sem vínculo nem aluno de outra', async () => {
      const users = await service.getUsersForRequester(teacher);
      const ids = users.map((u) => u.id);

      expect(ids).not.toContain('s2');
      expect(ids).not.toContain('s3');
    });

    it('o filtro alcança documentos legados sem `role`', async () => {
      userRepository.findAll.mockResolvedValueOnce([
        new User({ id: 's9', fullName: 'Legado', isTeacher: false, teacherId: 't2' }),
      ]);

      const users = await service.getUsersForRequester(teacher);
      expect(users).toHaveLength(0);
    });
  });
});
