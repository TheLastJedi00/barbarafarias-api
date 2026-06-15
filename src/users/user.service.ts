import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { User } from './user.entity';
import { CreateUserDto } from './dto/CreateUser.dto';
import { UpdateUserDto } from './dto/UpdateUser.dto';
import { ResponseUserDto } from './dto/ResponseUser.dto';
import { UserRepository } from './user.repository';
import { AuthService } from '../auth/auth.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private authService: AuthService,
  ) {}

  async createUser(dto: CreateUserDto): Promise<ResponseUserDto> {
    const uid = uuidv4();

    try {
      const role = dto.isTeacher ? 'teacher' : 'student';

      await this.authService.registerCredentials({
        id: uid,
        email: dto.email,
        password: dto.password,
        role: role,
      });

      const user = new User(dto);
      user.id = uid;
      const id = await this.userRepository.save(user, uid);
      const response = new ResponseUserDto(id, user.fullName);
      return response;
    } catch (error) {
      throw new Error('Error creating User:' + error);
    }
  }

  async getAllUsers(): Promise<User[]> {
    return this.userRepository.findAll();
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const foundUser = await this.userRepository.findById(id);
    if (!foundUser) {
      throw new Error('User not found');
    }
    const user = new User(dto);
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
