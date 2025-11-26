import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/CreateUser.dto';
import { User } from '../domain/user.model';
import { UpdateUserDto } from './dto/UpdateUser.dto';
import { FirebaseAuthGuard } from 'src/auth/infrastructure/firebase.guard';
import { RolesGuard } from 'src/auth/infrastructure/roles.guard';
import { Roles } from 'src/auth/infrastructure/decorators/roles.decorator';

@Controller('/users')
@UseGuards( FirebaseAuthGuard, RolesGuard )
export class UserController {
  constructor(private service: UserService) {}

  @Post()
  @Roles('teacher')
  async createUser(@Body() user: CreateUserDto): Promise<string> {
    return this.service.createUser(user);
  }
  @Get()
  @Roles('teacher')
  async getAll(): Promise<User[]> {
    return this.service.getAllUsers();
  }
  @Get(':id')
  @Roles('teacher')
  async findById(@Param('id') id: string): Promise<User | null> {
    return this.service.findById(id);
  }
  @Put(':id')
  @Roles('teacher')
  async update(@Param('id') id: string, @Body() user: UpdateUserDto): Promise<User> {
    return this.service.updateUser(id, user);
  }
  @Delete(':id')
  @Roles('teacher')
  async delete(@Param('id') id: string): Promise<void> {
    return this.service.delete(id);
  }
}
