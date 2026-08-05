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
