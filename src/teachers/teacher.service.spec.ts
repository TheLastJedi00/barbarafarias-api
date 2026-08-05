import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TeacherService } from './teacher.service';
import { ResponseTeacherDto, PublicTeacherDto } from './dto/ResponseTeacher.dto';
import { User } from '../users/user.entity';
import { ROLES } from '../types/role';

describe('TeacherService', () => {
  let service: TeacherService;
  let teacherRepository: {
    findAllStaff: jest.Mock;
    findStudentsByTeacher: jest.Mock;
    markStudentsPendingTeacher: jest.Mock;
  };
  let userRepository: { findById: jest.Mock; save: jest.Mock; update: jest.Mock };
  let authService: {
    createAccount: jest.Mock;
    deleteAccount: jest.Mock;
    sendPasswordReset: jest.Mock;
  };

  const teacher = new User({
    id: 't-1',
    fullName: 'Ana',
    email: 'ana@x.com',
    phone: '11999',
    role: ROLES.TEACHER,
    active: true,
  });

  beforeEach(() => {
    teacherRepository = {
      findAllStaff: jest.fn().mockResolvedValue([teacher]),
      findStudentsByTeacher: jest.fn().mockResolvedValue([]),
      markStudentsPendingTeacher: jest.fn().mockResolvedValue(0),
    };
    userRepository = {
      findById: jest.fn().mockResolvedValue(teacher),
      save: jest.fn().mockResolvedValue('t-1'),
      update: jest.fn().mockResolvedValue(undefined),
    };
    authService = {
      createAccount: jest.fn().mockResolvedValue(undefined),
      deleteAccount: jest.fn().mockResolvedValue(undefined),
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    };
    service = new TeacherService(
      teacherRepository as any,
      userRepository as any,
      authService as any,
      {
        studentsPendingTeacher: jest.fn().mockResolvedValue(undefined),
      } as any,
    );
  });

  const createDto = {
    fullName: 'Bia',
    email: 'bia@x.com',
    password: 'senha',
    phone: '11988',
    pixKey: 'bia@pix',
    cpf: '000',
  } as any;

  describe('create', () => {
    it('cria a conta com papel teacher e persiste a professora', async () => {
      const created = await service.create(createDto);

      expect(authService.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'bia@x.com', role: ROLES.TEACHER }),
      );
      expect(created.role).toBe(ROLES.TEACHER);
      expect(created.active).toBe(true);
      expect(created.phoneVisibleToStudent).toBe(false);
      expect(created.createdAt).toBeDefined();
      // mantém o booleano legado para não quebrar o filtro da spec 007
      expect(created.isTeacher).toBe(true);
    });

    it('remove a credencial quando a gravação da professora falha', async () => {
      userRepository.save.mockRejectedValueOnce(new Error('firestore fora'));

      await expect(service.create(createDto)).rejects.toThrow('firestore fora');
      expect(authService.deleteAccount).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('não devolve aluno como professora', async () => {
      userRepository.findById.mockResolvedValueOnce(
        new User({ id: 's-1', role: ROLES.STUDENT } as any),
      );
      await expect(service.findById('s-1')).rejects.toThrow(NotFoundException);
    });

    it('aceita documento legado sem role, usando isTeacher', async () => {
      userRepository.findById.mockResolvedValueOnce(
        new User({ id: 't-legado', isTeacher: true } as any),
      );
      await expect(service.findById('t-legado')).resolves.toBeDefined();
    });
  });

  describe('setActive', () => {
    it('ao desativar, marca os alunos como pendentes de professora', async () => {
      teacherRepository.markStudentsPendingTeacher.mockResolvedValueOnce(3);

      const result = await service.setActive('t-1', false);

      expect(result.pendingStudents).toBe(3);
      expect(teacherRepository.markStudentsPendingTeacher).toHaveBeenCalledWith(
        't-1',
      );
      expect(userRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ active: false }),
      );
    });

    it('ao reativar, não mexe nos alunos', async () => {
      const result = await service.setActive('t-1', true);

      expect(result.pendingStudents).toBe(0);
      expect(teacherRepository.markStudentsPendingTeacher).not.toHaveBeenCalled();
    });

    it('impede desativar a gerente', async () => {
      userRepository.findById.mockResolvedValueOnce(
        new User({ id: 'm-1', role: ROLES.MANAGER } as any),
      );
      await expect(service.setActive('m-1', false)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findResponsibleFor', () => {
    it('devolve null quando o aluno não tem professora', async () => {
      userRepository.findById.mockResolvedValueOnce(
        new User({ id: 's-1', role: ROLES.STUDENT } as any),
      );
      await expect(service.findResponsibleFor('s-1')).resolves.toBeNull();
    });
  });
});

describe('DTOs de professora', () => {
  const full = new User({
    id: 't-1',
    fullName: 'Ana',
    email: 'ana@x.com',
    phone: '11999',
    cpf: '123',
    cnpj: '456',
    pixKey: 'ana@pix',
    hourlyRate: 70,
    role: ROLES.TEACHER,
  });

  it('a visão da gerente carrega os dados sensíveis', () => {
    const dto = new ResponseTeacherDto(full, 4);
    expect(dto.cpf).toBe('123');
    expect(dto.pixKey).toBe('ana@pix');
    expect(dto.hourlyRate).toBe(70);
    expect(dto.studentsCount).toBe(4);
  });

  it('a visão do aluno não expõe dado fiscal nem financeiro', () => {
    const dto = new PublicTeacherDto(full) as any;
    expect(dto.cpf).toBeUndefined();
    expect(dto.cnpj).toBeUndefined();
    expect(dto.pixKey).toBeUndefined();
    expect(dto.hourlyRate).toBeUndefined();
    expect(dto.email).toBeUndefined();
  });

  it('o telefone só aparece ao aluno quando a professora permite', () => {
    expect(new PublicTeacherDto(full).phone).toBeUndefined();

    const visible = new User({ ...full, phoneVisibleToStudent: true });
    expect(new PublicTeacherDto(visible).phone).toBe('11999');
  });
});

describe('TeacherService — convite (spec 018 Fase 7)', () => {
  function build() {
    const teacherRepository = {
      findAllStaff: jest.fn().mockResolvedValue([]),
      findStudentsByTeacher: jest.fn().mockResolvedValue([]),
      markStudentsPendingTeacher: jest.fn().mockResolvedValue(0),
    };
    const userRepository = {
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue('t-9'),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const authService = {
      createAccount: jest.fn().mockResolvedValue(undefined),
      deleteAccount: jest.fn().mockResolvedValue(undefined),
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    };
    const notifications = { notifyTeacherAssigned: jest.fn() };
    const service = new TeacherService(
      teacherRepository as any,
      userRepository as any,
      authService as any,
      notifications as any,
    );
    return { service, userRepository, authService };
  }

  it('cria a conta com senha descartável e manda o e-mail de entrada', async () => {
    const { service, userRepository, authService } = build();

    await service.invite('nova@x.com');

    const conta = authService.createAccount.mock.calls[0][0];
    expect(conta.role).toBe(ROLES.TEACHER);
    expect(conta.sendVerification).toBe(false);
    expect(conta.password).toEqual(expect.any(String));

    const [gravada] = userRepository.save.mock.calls[0];
    expect(gravada.email).toBe('nova@x.com');
    expect(gravada.isTeacher).toBe(true);
    expect(gravada.active).toBe(true);
    // Ausência do carimbo é o que marca o convite como pendente.
    expect(gravada.onboardedAt).toBeUndefined();
    expect(gravada.pixKey).toBeUndefined();

    expect(authService.sendPasswordReset).toHaveBeenCalledWith('nova@x.com');
  });

  it('não deixa conta órfã quando a gravação falha', async () => {
    const { service, userRepository, authService } = build();
    userRepository.save.mockRejectedValue(new Error('firestore down'));

    await expect(service.invite('nova@x.com')).rejects.toThrow('firestore down');

    expect(authService.deleteAccount).toHaveBeenCalledTimes(1);
    expect(authService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('recusa reenvio para quem já concluiu', async () => {
    const { service, userRepository, authService } = build();
    userRepository.findById.mockResolvedValue(
      new User({
        id: 't-9',
        email: 'ana@x.com',
        role: ROLES.TEACHER,
        onboardedAt: '2026-08-01T10:00:00.000Z',
      }),
    );

    await expect(service.resendInvite('t-9')).rejects.toThrow(/já concluiu/i);
    expect(authService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('carimba a conclusão quando a chave PIX — o último campo — chega', async () => {
    const { service, userRepository } = build();
    userRepository.findById.mockResolvedValue(
      new User({
        id: 't-9',
        email: 'ana@x.com',
        role: ROLES.TEACHER,
        fullName: 'Ana',
        phone: '11999999999',
        cpf: '39053344705',
      }),
    );

    const updated = await service.updateOwnProfile('t-9', {
      pixKey: 'ana@x.com',
    } as any);

    expect(updated.onboardedAt).toEqual(expect.any(String));
  });

  it('não carimba a gerente, que não passa por onboarding', async () => {
    // Ela é quem conserta o que trava: retê-la seria trancar a chave dentro
    // de casa (decisão nº 9).
    const { service, userRepository } = build();
    userRepository.findById.mockResolvedValue(
      new User({ id: 'm-1', email: 'g@x.com', role: ROLES.MANAGER }),
    );

    const updated = await service.updateOwnProfile('m-1', {
      fullName: 'Bárbara',
    } as any);

    expect(updated.onboardedAt).toBeUndefined();
  });
});

describe('TeacherService — excluir convite (spec 018 Task 130)', () => {
  function build(teacher: User, alunos: User[] = []) {
    const teacherRepository = {
      findAllStaff: jest.fn().mockResolvedValue([]),
      findStudentsByTeacher: jest.fn().mockResolvedValue(alunos),
      markStudentsPendingTeacher: jest.fn().mockResolvedValue(0),
    };
    const userRepository = {
      findById: jest.fn().mockResolvedValue(teacher),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const authService = {
      createAccount: jest.fn(),
      deleteAccount: jest.fn().mockResolvedValue(undefined),
      sendPasswordReset: jest.fn(),
    };
    const service = new TeacherService(
      teacherRepository as any,
      userRepository as any,
      authService as any,
      { notifyTeacherAssigned: jest.fn() } as any,
    );
    return { service, userRepository, authService };
  }

  const convitePendente = new User({
    id: 't-9',
    email: 'errado@x.com',
    role: ROLES.TEACHER,
    active: true,
  });

  it('apaga o documento e a conta de quem nunca entrou', async () => {
    const { service, userRepository, authService } = build(convitePendente);

    await service.deleteInvite('t-9');

    expect(userRepository.delete).toHaveBeenCalledWith('t-9');
    // Sem isto sobraria uma conta órfã capaz de pedir redefinição de senha.
    expect(authService.deleteAccount).toHaveBeenCalledWith('t-9');
  });

  it('recusa quem já concluiu o cadastro', async () => {
    const { service, userRepository } = build(
      new User({
        ...convitePendente,
        fullName: 'Carla',
        onboardedAt: '2026-08-01T10:00:00.000Z',
      }),
    );

    await expect(service.deleteInvite('t-9')).rejects.toThrow(/desativar/i);
    expect(userRepository.delete).not.toHaveBeenCalled();
  });

  it('recusa professora antiga, anterior ao carimbo', async () => {
    // O caso perigoso: toda a base é anterior ao `onboardedAt`, e uma regra
    // que olhasse só para ele deixaria apagar professora em atividade.
    const { service, userRepository } = build(
      new User({ ...convitePendente, fullName: 'Bárbara', onboardedAt: undefined }),
    );

    await expect(service.deleteInvite('t-9')).rejects.toThrow(/desativar/i);
    expect(userRepository.delete).not.toHaveBeenCalled();
  });

  it('recusa a gerente', async () => {
    const { service, userRepository } = build(
      new User({ id: 'm-1', email: 'g@x.com', role: ROLES.MANAGER }),
    );

    await expect(service.deleteInvite('m-1')).rejects.toThrow(/gerente/i);
    expect(userRepository.delete).not.toHaveBeenCalled();
  });

  it('recusa convite que, por algum motivo, já tem aluno vinculado', async () => {
    // Apagar deixaria alunos apontando para uma professora que sumiu, sem o
    // `pendingTeacher` que a desativação marca.
    const { service, userRepository } = build(convitePendente, [
      new User({ id: 'a-1' }),
    ]);

    await expect(service.deleteInvite('t-9')).rejects.toThrow(/alunos/i);
    expect(userRepository.delete).not.toHaveBeenCalled();
  });
});
