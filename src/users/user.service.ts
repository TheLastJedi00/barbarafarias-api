import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from './user.entity';
import { CreateUserDto } from './dto/CreateUser.dto';
import { UpdateUserDto } from './dto/UpdateUser.dto';
import { UpdateProfileDto } from './dto/UpdateProfile.dto';
import { pickDefined } from '../common/patch';
import { ResponseUserDto } from './dto/ResponseUser.dto';
import { UserRepository } from './user.repository';
import { AuthService } from '../auth/auth.service';
import { ROLES, Role } from '../types/role';
import { randomUUID } from 'node:crypto';

@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private authService: AuthService,
  ) {}

  async createUser(dto: CreateUserDto): Promise<ResponseUserDto> {
    const uid = randomUUID();
    const role = dto.isTeacher ? ROLES.TEACHER : ROLES.STUDENT;

    await this.authService.registerCredentials({
      id: uid,
      email: dto.email,
      password: dto.password,
      role: role,
    });

    try {
      // nasce já migrado: grava `role` junto do `isTeacher` legado
      const user = new User({ ...dto, role });
      user.id = uid;
      const id = await this.userRepository.save(user, uid);
      return new ResponseUserDto(id, user.fullName);
    } catch (error) {
      // rollback: evita credencial órfã caso a gravação do usuário falhe
      await this.authService.removeCredentials(uid);
      throw error;
    }
  }

  async getAllUsers(role?: Role): Promise<User[]> {
    return this.userRepository.findAll(role);
  }

  async updateUser(id: string, dto: UpdateUserDto): Promise<User> {
    const foundUser = await this.userRepository.findById(id);
    if (!foundUser) {
      throw new NotFoundException('User not found');
    }
    // merge over the existing user and pin the id from the route param,
    // so partial updates don't wipe fields nor depend on the request body id
    const user = new User({ ...foundUser, ...dto, id });
    await this.userRepository.update(user);
    return user;
  }

  /**
   * Atualização que o próprio usuário faz do seu perfil. Só os campos do
   * `UpdateProfileDto` são gravados — o resto do documento permanece como
   * está, para que a edição do aluno não alcance dados de gestão.
   */
  async updateOwnProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    const foundUser = await this.userRepository.findById(id);
    if (!foundUser) {
      throw new NotFoundException('User not found');
    }
    const patch = pickDefined(dto);
    const user = new User({ ...foundUser, ...patch, id });
    await this.userRepository.update(user);
    return user;
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async delete(id: string): Promise<void> {
    return await this.userRepository.delete(id);
  }
}
