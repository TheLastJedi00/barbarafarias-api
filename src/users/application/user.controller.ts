import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/CreateUser.dto';
import { User } from '../domain/user.model';
import { UpdateUserDto } from './dto/UpdateUser.dto';

@Controller('/users')
export class UserController {
  constructor(private service: UserService) {}

  @Post()
  async createUser(@Body() user: CreateUserDto): Promise<string> {
    return this.service.createUser(user);
  }
  @Get()
  async getAll(): Promise<User[]> {
    return this.service.getAllUsers();
  }
  @Get(':id')
  async findById(@Param('id') id: string): Promise<User | null> {
    return this.service.findById(id);
  }
  @Put(':id')
  async update(@Param('id') id: string, @Body() user: UpdateUserDto): Promise<User> {
    return this.service.updateUser(id, user);
  }
  @Delete(':id')
  async delete(@Param('id') id: string): Promise<void> {
    return this.service.delete(id);
  }
}
