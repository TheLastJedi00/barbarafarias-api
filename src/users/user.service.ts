import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/CreateUser.dto';
import { UpdateUserDto } from './dto/UpdateUser.dto';
import * as admin from 'firebase-admin';
import { ResponseUserDto } from './dto/ResponseUser.dto';
import { UserRepository } from './user.repository';

@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
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
      const user = new User(dto);
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
