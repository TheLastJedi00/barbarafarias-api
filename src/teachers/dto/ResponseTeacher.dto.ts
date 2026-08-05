import { User } from '../../users/user.entity';
import { Role, resolveRole } from '../../types/role';

/**
 * Visão completa da professora — só para a gerente. Carrega dados sensíveis
 * (CPF, CNPJ, PIX, valor-hora) que nunca podem chegar a aluno ou a outra
 * professora (spec 010 RNF4).
 */
export class ResponseTeacherDto {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: Role;
  createdAt?: string;
  pixKey?: string;
  cpf?: string;
  cnpj?: string;
  hourlyRate?: number;
  phoneVisibleToStudent: boolean;
  active: boolean;
  studentsCount?: number;
  profileImageUrl?: string;
  bio?: string;
  /** Vem do token, não do documento (spec 016 Task 78). */
  emailVerified?: boolean;

  constructor(user: User, studentsCount?: number) {
    this.id = user.id!;
    this.fullName = user.fullName;
    this.email = user.email;
    this.phone = user.phone;
    this.role = resolveRole(user);
    this.createdAt = user.createdAt;
    this.pixKey = user.pixKey;
    this.cpf = user.cpf;
    this.cnpj = user.cnpj;
    this.hourlyRate = user.hourlyRate;
    this.phoneVisibleToStudent = user.phoneVisibleToStudent ?? false;
    this.active = user.active ?? true;
    this.studentsCount = studentsCount;
    this.profileImageUrl = user.profileImageUrl;
    this.bio = user.bio;
  }
}

/**
 * Visão que o aluno pode receber: nome, foto, bio e — só se a professora
 * permitiu — o telefone. Nenhum dado fiscal ou financeiro. Foto e bio são
 * públicas por natureza: alimentam o card da agenda e o modal de detalhes
 * do aluno (spec 011 RF5.1).
 */
export class PublicTeacherDto {
  id: string;
  fullName: string;
  phone?: string;
  profileImageUrl?: string;
  bio?: string;

  constructor(user: User) {
    this.id = user.id!;
    this.fullName = user.fullName;
    this.phone = user.phoneVisibleToStudent ? user.phone : undefined;
    this.profileImageUrl = user.profileImageUrl;
    this.bio = user.bio;
  }
}
