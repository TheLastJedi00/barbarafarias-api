import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { TeacherRepository } from './teacher.repository';
import { UserRepository } from '../users/user.repository';
import { AuthService } from '../auth/auth.service';
import { User } from '../users/user.entity';
import { CreateTeacherDto } from './dto/CreateTeacher.dto';
import { UpdateTeacherDto } from './dto/UpdateTeacher.dto';
import { ROLES, resolveRole, isStaff } from '../types/role';

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
  ) {}

  async create(dto: CreateTeacherDto): Promise<User> {
    const uid = uuidv4();

    await this.authService.registerCredentials({
      id: uid,
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
      // rollback: evita credencial órfã caso a gravação falhe
      await this.authService.removeCredentials(uid);
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
    const updated = new User({ ...teacher, ...dto, id });
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

    const pendingStudents = active
      ? 0
      : await this.teacherRepository.markStudentsPendingTeacher(id);

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

  /** Professora responsável por um aluno; null quando ainda não há vínculo. */
  async findResponsibleFor(studentId: string): Promise<User | null> {
    const student = await this.userRepository.findById(studentId);
    if (!student?.teacherId) {
      return null;
    }
    return this.userRepository.findById(student.teacherId);
  }
}
