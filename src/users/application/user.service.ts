import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { User } from '../domain/user.model';
import { CreateUserDto } from '../application/dto/CreateUser.dto';
import type { UserRepository } from '../domain/user.repository.port';
import { UpdateUserDto } from './dto/UpdateUser.dto';
import * as admin from 'firebase-admin';
import { ResponseUserDto } from './dto/ResponseUser.dto';

@Injectable()
export class UserService {
  constructor(
    @Inject('UserRepository') private userRepository: UserRepository,
  ) {}

  async createUser(dto: CreateUserDto): Promise<ResponseUserDto> {
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email: dto.email,
        password: dto.password,
      });
      console.log('User created:', userRecord.email);
    } catch (error) {
      throw new Error('Error creating Auth:' + error);
    }
    try {
      const uid = userRecord.uid;
      const user = new User(
        dto.fullName,
        dto.phone,
        dto.email,
        dto.isPaying,
        dto.isTeacher,
        dto.level,
        dto.objectives,
        dto.prognosis,
      );
      console.log('Creating User:' + user.getFullName());
      const id = await this.userRepository.save(user, uid);
      const response = new ResponseUserDto(
        id,
        user.getFullName(),
        user.getCreatedAt(),
        user.getUpdatedAt(),
      );
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
    const user = new User(
      dto.fullName,
      dto.phone,
      dto.email,
      dto.isPaying,
      dto.isTeacher,
      dto.level,
      dto.objectives,
      dto.prognosis,
      foundUser.getId(),
    );
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
