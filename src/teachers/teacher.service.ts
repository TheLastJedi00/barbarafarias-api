import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TeacherRepository } from './teacher.repository';
import { UserRepository } from '../users/user.repository';
import { AuthService } from '../auth/auth.service';
import { User } from '../users/user.entity';
import { CreateTeacherDto } from './dto/CreateTeacher.dto';
import { UpdateTeacherDto } from './dto/UpdateTeacher.dto';
import { UpdateTeacherProfileDto } from '../users/dto/UpdateProfile.dto';
import { pickDefined } from '../common/patch';
import { ROLES, resolveRole, isStaff } from '../types/role';
import { NotificationService } from '../notifications/notification.service';

export interface TeacherSummary {
  teacher: User;
  studentsCount: number;
}

@Injectable()
export class TeacherService {
  constructor(
    private readonly teacherRepository: TeacherRepository,
    private readonly userRepository: UserRepository,
    private readonly authService: AuthService,
    private readonly notifications: NotificationService,
  ) {}

  async create(dto: CreateTeacherDto): Promise<User> {
    const uid = randomUUID();

    await this.authService.createAccount({
      uid,
      email: dto.email,
      password: dto.password,
      role: ROLES.TEACHER,
    });

    try {
      const teacher = new User({
        id: uid,
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        role: ROLES.TEACHER,
        // mantido enquanto a base convive com o filtro legado (spec 007)
        isTeacher: true,
        isPaying: false,
        level: '',
        objective: '',
        prognosis: '',
        createdAt: new Date().toISOString(),
        pixKey: dto.pixKey,
        cpf: dto.cpf,
        cnpj: dto.cnpj,
        hourlyRate: dto.hourlyRate,
        phoneVisibleToStudent: dto.phoneVisibleToStudent ?? false,
        active: true,
      });
      await this.userRepository.save(teacher, uid);
      return teacher;
    } catch (error) {
      // rollback: evita conta órfã caso a gravação falhe
      await this.authService.deleteAccount(uid);
      throw error;
    }
  }

  async findAll(): Promise<TeacherSummary[]> {
    const staff = await this.teacherRepository.findAllStaff();
    return Promise.all(
      staff.map(async (teacher) => ({
        teacher,
        studentsCount: (
          await this.teacherRepository.findStudentsByTeacher(teacher.id!)
        ).length,
      })),
    );
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user || !isStaff(resolveRole(user))) {
      throw new NotFoundException('Professora não encontrada');
    }
    return user;
  }

  async update(id: string, dto: UpdateTeacherDto): Promise<User> {
    const teacher = await this.findById(id);
    const updated = new User({ ...teacher, ...pickDefined(dto), id });
    await this.userRepository.update(updated);
    return updated;
  }

  /**
   * Edição que a própria professora faz do seu perfil (spec 011 RF13).
   * Restrito a nome, telefone, foto e bio: dados fiscais e valor-hora
   * continuam saindo só pelo painel da gerente.
   */
  async updateOwnProfile(
    id: string,
    dto: UpdateTeacherProfileDto,
  ): Promise<User> {
    const teacher = await this.findById(id);
    const updated = new User({ ...teacher, ...pickDefined(dto), id });
    await this.userRepository.update(updated);
    return updated;
  }

  /**
   * Desativa (ou reativa) a professora. Ao desativar, os alunos dela ficam
   * pendentes de realocação — a gerente é alertada no dashboard.
   */
  async setActive(
    id: string,
    active: boolean,
  ): Promise<{ teacher: User; pendingStudents: number }> {
    const teacher = await this.findById(id);
    if (resolveRole(teacher) === ROLES.MANAGER && !active) {
      throw new BadRequestException('A gerente não pode ser desativada');
    }

    const updated = new User({ ...teacher, active, id });
    await this.userRepository.update(updated);

    if (active) {
      return { teacher: updated, pendingStudents: 0 };
    }

    const students = await this.teacherRepository.findStudentsByTeacher(id);
    const pendingStudents =
      await this.teacherRepository.markStudentsPendingTeacher(id);
    await this.notifications.studentsPendingTeacher(
      teacher.fullName,
      students.map((student) => student.fullName),
    );

    return { teacher: updated, pendingStudents };
  }

  async setPhoneVisibility(id: string, visible: boolean): Promise<User> {
    const teacher = await this.findById(id);
    const updated = new User({
      ...teacher,
      phoneVisibleToStudent: visible,
      id,
    });
    await this.userRepository.update(updated);
    return updated;
  }

  async findStudents(teacherId: string): Promise<User[]> {
    await this.findById(teacherId);
    return this.teacherRepository.findStudentsByTeacher(teacherId);
  }

  /**
   * Substitui o roster de alunos da professora. Quem entra fica vinculado (e
   * deixa de estar pendente); quem sai volta para a fila de realocação.
   */
  async assignStudents(
    teacherId: string,
    studentIds: string[],
  ): Promise<{ assigned: number; released: number }> {
    const teacher = await this.findById(teacherId);
    const current = await this.teacherRepository.findStudentsByTeacher(
      teacherId,
    );

    const released = current.filter((s) => !studentIds.includes(s.id!));
    for (const student of released) {
      await this.userRepository.update(
        new User({
          ...student,
          teacherId: undefined,
          teacherName: undefined,
          pendingTeacher: true,
        }),
      );
    }

    for (const studentId of studentIds) {
      const student = await this.userRepository.findById(studentId);
      if (!student) {
        throw new NotFoundException(`Aluno ${studentId} não encontrado`);
      }
      await this.userRepository.update(
        new User({
          ...student,
          teacherId,
          teacherName: teacher.fullName,
          pendingTeacher: false,
        }),
      );
    }

    return { assigned: studentIds.length, released: released.length };
  }

  /** Configuração individual do aluno: professora, carga, reposição e sala. */
  async updateStudentAssignment(
    studentId: string,
    dto: {
      teacherId?: string | null;
      lessonsPerWeek?: number;
      makeupSlot?: { dayOfWeek: number; hour: number };
      meetUrl?: string;
    },
  ): Promise<User> {
    const student = await this.userRepository.findById(studentId);
    if (!student) {
      throw new NotFoundException('Aluno não encontrado');
    }

    const patch: Partial<User> = {};
    if (dto.teacherId !== undefined) {
      if (dto.teacherId === null) {
        patch.teacherId = undefined;
        patch.teacherName = undefined;
        patch.pendingTeacher = true;
      } else {
        const teacher = await this.findById(dto.teacherId);
        patch.teacherId = teacher.id;
        patch.teacherName = teacher.fullName;
        patch.pendingTeacher = false;
      }
    }
    if (dto.lessonsPerWeek !== undefined) patch.lessonsPerWeek = dto.lessonsPerWeek;
    if (dto.makeupSlot !== undefined) patch.makeupSlot = dto.makeupSlot;
    if (dto.meetUrl !== undefined) patch.meetUrl = dto.meetUrl;

    const updated = new User({ ...student, ...patch, id: studentId });
    await this.userRepository.update(updated);
    return updated;
  }

  /** Professora responsável por um aluno; null quando ainda não há vínculo. */
  async findResponsibleFor(studentId: string): Promise<User | null> {
    const student = await this.userRepository.findById(studentId);
    if (!student?.teacherId) {
      return null;
    }
    return this.userRepository.findById(student.teacherId);
  }
}
