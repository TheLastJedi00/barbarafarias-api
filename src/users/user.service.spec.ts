import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
    delete: jest.Mock;
  };
  let authService: {
    createAccount: jest.Mock;
    deleteAccount: jest.Mock;
    sendPasswordReset: jest.Mock;
  };

  beforeEach(() => {
    userRepository = {
      findById: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue('uid-1'),
      findAll: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    authService = {
      createAccount: jest.fn().mockResolvedValue(undefined),
      deleteAccount: jest.fn().mockResolvedValue(undefined),
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
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

    it('cria a conta no Firebase e persiste o usuário', async () => {
      const result = await service.createUser(dto);
      expect(authService.createAccount).toHaveBeenCalledTimes(1);
      expect(userRepository.save).toHaveBeenCalledTimes(1);
      expect(result.fullName).toBe('Ana');
    });

    it('apaga a conta se a gravação do usuário falhar', async () => {
      userRepository.save.mockRejectedValue(new Error('firestore down'));
      await expect(service.createUser(dto)).rejects.toThrow('firestore down');
      expect(authService.deleteAccount).toHaveBeenCalledTimes(1);
    });
  });

  describe('inviteUser (spec 018)', () => {
    it('cria a conta, grava o documento mínimo e manda o e-mail de entrada', async () => {
      const result = await service.inviteUser('novo@x.com');

      const conta = authService.createAccount.mock.calls[0][0];
      expect(conta.email).toBe('novo@x.com');
      expect(conta.role).toBe(ROLES.STUDENT);
      // A senha é aleatória e descartável: mandar a verificação faria login
      // com ela, o que não tem sentido nenhum aqui.
      expect(conta.sendVerification).toBe(false);
      expect(conta.password).toEqual(expect.any(String));
      expect(conta.password.length).toBeGreaterThan(10);

      const [gravado] = userRepository.save.mock.calls[0];
      expect(gravado.email).toBe('novo@x.com');
      expect(gravado.isPaying).toBe(false);
      // Ausência de `onboardedAt` é o que marca o convite como pendente.
      expect(gravado.onboardedAt).toBeUndefined();
      expect(gravado.fullName).toBeUndefined();

      expect(authService.sendPasswordReset).toHaveBeenCalledWith('novo@x.com');
      expect(result.id).toEqual(expect.any(String));
    });

    it('não deixa conta órfã quando a gravação falha', async () => {
      userRepository.save.mockRejectedValue(new Error('firestore down'));

      await expect(service.inviteUser('novo@x.com')).rejects.toThrow(
        'firestore down',
      );

      expect(authService.deleteAccount).toHaveBeenCalledTimes(1);
      expect(authService.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('reenvia o convite de quem ainda não concluiu', async () => {
      userRepository.findById.mockResolvedValue(
        new User({ id: 'uid-1', email: 'novo@x.com', role: ROLES.STUDENT }),
      );

      await service.resendInvite('uid-1');

      expect(authService.sendPasswordReset).toHaveBeenCalledWith('novo@x.com');
    });

    it('recusa reenvio para quem já concluiu o cadastro', async () => {
      userRepository.findById.mockResolvedValue(
        new User({
          id: 'uid-1',
          email: 'ana@x.com',
          role: ROLES.STUDENT,
          onboardedAt: '2026-08-01T10:00:00.000Z',
        }),
      );

      await expect(service.resendInvite('uid-1')).rejects.toThrow(
        /já concluiu/i,
      );
      expect(authService.sendPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('onboarding (spec 018)', () => {
    /** Aluno convidado, com o documento ainda vazio. */
    function convidado(extra: Partial<User> = {}) {
      return new User({
        id: 'uid-1',
        email: 'novo@x.com',
        role: ROLES.STUDENT,
        ...extra,
      });
    }

    it('marca a conclusão quando o último campo que faltava chega', async () => {
      userRepository.findById.mockResolvedValue(
        convidado({ fullName: 'Ana', phone: '11999999999', cpf: '12345678909' }),
      );

      const user = await service.updateOwnProfile('uid-1', {
        objective: 'Viajar a trabalho',
      } as any);

      expect(user.onboardedAt).toEqual(expect.any(String));
    });

    it('não marca enquanto falta campo', async () => {
      userRepository.findById.mockResolvedValue(convidado({ fullName: 'Ana' }));

      const user = await service.updateOwnProfile('uid-1', {
        phone: '11999999999',
      } as any);

      expect(user.onboardedAt).toBeUndefined();
    });

    it('não reescreve a data em edições posteriores', async () => {
      // É registro de quando aconteceu. Reescrever faria a gerente ver a data
      // andar toda vez que o aluno trocasse a foto.
      const antes = '2026-01-01T00:00:00.000Z';
      userRepository.findById.mockResolvedValue(
        convidado({
          fullName: 'Ana',
          phone: '11999999999',
          cpf: '12345678909',
          objective: 'Viajar',
          onboardedAt: antes,
        }),
      );

      const user = await service.updateOwnProfile('uid-1', {
        fullName: 'Ana Maria',
      } as any);

      expect(user.onboardedAt).toBe(antes);
    });

    it('não aplica a régua a professora nem a gerente', async () => {
      userRepository.findById.mockResolvedValue(
        new User({ id: 'uid-2', email: 't@x.com', role: ROLES.TEACHER }),
      );

      const user = await service.updateOwnProfile('uid-2', {
        fullName: 'Bárbara',
      } as any);

      expect(user.onboardedAt).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('apaga o documento e a conta de autenticação', async () => {
      // Só apagar o documento deixava a conta órfã. Antes isso passava batido
      // porque o login dependia de `users`; com o Firebase, a conta órfã
      // continua conseguindo token — quem saiu da escola entraria e veria 404.
      await service.delete('uid-1');

      expect(userRepository.delete).toHaveBeenCalledWith('uid-1');
      expect(authService.deleteAccount).toHaveBeenCalledWith('uid-1');
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

  const manager = { sub: 'm1', email: 'g@x.com', role: 'manager' } as any;
  const teacher = { sub: 't1', email: 't@x.com', role: 'teacher' } as any;
  const student = { sub: 'a1', email: 'a@x.com', role: 'student' } as any;

  describe('updateUser', () => {
    it('lança NotFound quando o usuário não existe', async () => {
      userRepository.findById.mockResolvedValue(null);
      await expect(
        service.updateUser(manager, 'id-1', {} as any),
      ).rejects.toBeInstanceOf(NotFoundException);
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

      const result = await service.updateUser(manager, 'route-id', {
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

    it('professora não edita aluno de outra professora', async () => {
      userRepository.findById.mockResolvedValue(
        new User({ id: 'a9', fullName: 'Léo', teacherId: 'outra', isTeacher: false }),
      );

      await expect(
        service.updateUser(teacher, 'a9', { fullName: 'x' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('professora edita aluno vinculado a ela', async () => {
      userRepository.findById.mockResolvedValue(
        new User({ id: 'a1', fullName: 'Léo', teacherId: 't1', isTeacher: false }),
      );

      await service.updateUser(teacher, 'a1', { fullName: 'Léo M.' } as any);

      expect(userRepository.update).toHaveBeenCalledTimes(1);
    });

    // spec 012 Task 18 — isPaying derivado da assinatura, com retrocompat.
    it('aluno sem assinatura continua com o isPaying manual', async () => {
      userRepository.findById.mockResolvedValue(
        new User({ id: 'a1', fullName: 'Ana', isPaying: false }),
      );

      const result = await service.updateUser(manager, 'a1', {
        isPaying: true,
      } as any);

      expect(result.isPaying).toBe(true);
    });

    it('aluno com assinatura ignora o isPaying enviado à mão', async () => {
      userRepository.findById.mockResolvedValue(
        new User({
          id: 'a1',
          fullName: 'Ana',
          isPaying: true,
          subscriptionStatus: 'ACTIVE',
        }),
      );

      const result = await service.updateUser(manager, 'a1', {
        isPaying: false,
        fullName: 'Ana Paula',
      } as any);

      expect(result.isPaying).toBe(true);
      // os demais campos do mesmo PATCH continuam valendo
      expect(result.fullName).toBe('Ana Paula');
    });
  });

  describe('findByIdForRequester (spec 011 RF2.1)', () => {
    const professora = new User({
      id: 't1',
      fullName: 'Ana',
      isTeacher: true,
      role: 'teacher',
      pixKey: 'chave-secreta',
      cpf: '000',
    });

    it('aluno não alcança a ficha da professora', async () => {
      userRepository.findById.mockResolvedValue(professora);

      await expect(
        service.findByIdForRequester(student, 't1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('aluno alcança a própria ficha', async () => {
      userRepository.findById.mockResolvedValue(
        new User({ id: 'a1', fullName: 'Léo', isTeacher: false }),
      );

      const result = await service.findByIdForRequester(student, 'a1');

      expect(result.id).toBe('a1');
    });

    it('professora não alcança a ficha de outra professora', async () => {
      userRepository.findById.mockResolvedValue(
        new User({ id: 't2', fullName: 'Bia', isTeacher: true, role: 'teacher' }),
      );

      await expect(
        service.findByIdForRequester(teacher, 't2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('professora alcança aluno vinculado a ela', async () => {
      userRepository.findById.mockResolvedValue(
        new User({ id: 'a1', fullName: 'Léo', teacherId: 't1', isTeacher: false }),
      );

      const result = await service.findByIdForRequester(teacher, 'a1');

      expect(result.id).toBe('a1');
    });

    it('gerente alcança qualquer um', async () => {
      userRepository.findById.mockResolvedValue(professora);

      const result = await service.findByIdForRequester(manager, 't1');

      expect(result.pixKey).toBe('chave-secreta');
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
