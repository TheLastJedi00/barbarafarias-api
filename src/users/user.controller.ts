import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CreateUserDto } from './dto/CreateUser.dto';
import { User } from './user.entity';
import { UpdateUserDto } from './dto/UpdateUser.dto';
import { Roles } from '../decorators/roles.decorator';
import { ResponseUserDto } from './dto/ResponseUser.dto';
import { UserService } from './user.service';
import { ROLES } from '../types/role';
import type { Role } from '../types/role';

@Controller('/users')
export class UserController {
  constructor(private service: UserService) {}

  @Post()
  @Roles(ROLES.TEACHER)
  async createUser(@Body() user: CreateUserDto): Promise<ResponseUserDto> {
    return this.service.createUser(user);
  }
  @Get()
  @Roles(ROLES.TEACHER)
  async getAll(@Query('role') role?: Role): Promise<User[]> {
    return this.service.getAllUsers(role);
  }
  @Get(':id')
  async findById(@Param('id') id: string): Promise<User | null> {
    return this.service.findById(id);
  }
  @Put(':id')
  @Roles(ROLES.TEACHER)
  async update(
    @Param('id') id: string,
    @Body() user: UpdateUserDto,
  ): Promise<User> {
    return this.service.updateUser(id, user);
  }
  @Delete(':id')
  @Roles(ROLES.TEACHER)
  async delete(@Param('id') id: string): Promise<void> {
    return this.service.delete(id);
  }
}
