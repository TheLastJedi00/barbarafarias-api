import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { User } from '../domain/user.model';
import { CreateUserDto } from '../application/dto/CreateUser.dto';
import type { UserRepository } from '../domain/user.repository.port';
import { UpdateUserDto } from './dto/UpdateUser.dto';
import * as admin from 'firebase-admin';

@Injectable()
export class UserService {
  
  constructor(
    @Inject('UserRepository') private userRepository: UserRepository,
  ) {}

  async createUser(dto: CreateUserDto): Promise<string> {
    let userRecord;
    try{
      userRecord = await admin.auth().createUser({
        email: dto.email,
        emailVerified: false,
        phoneNumber: dto.phone,
        password: dto.password,
        displayName: dto.fullName,
        disabled: false,
      });
    } catch (error) {
      throw new Error('Error creating Auth:' + error);
    }
    const uid = userRecord.uid;
    const user = new User(
      dto.fullName,
      dto.phone,
      dto.email,
      dto.isPaying,
      dto.isTeacher,
      dto.level,
      dto.objectives,
      dto.prognosys,
    );
    return await this.userRepository.save(user, uid);
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

  delete(id: string): Promise<void> {
      const user = this.userRepository.delete(id);
      if (!user) {
        throw new Error('User not found');
      }
      return user;
  }
}
