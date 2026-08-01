import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CreateUserDto } from './dto/CreateUser.dto';
import { User } from './user.entity';
import { UpdateUserDto } from './dto/UpdateUser.dto';
import { UpdateProfileDto } from './dto/UpdateProfile.dto';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
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
  /** Perfil do aluno logado. Rota fixa antes das paramétricas. */
  @Get('me')
  @Roles(ROLES.STUDENT)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<User> {
    return this.service.findById(user.sub);
  }

  /** Edição que o próprio aluno faz: nome, telefone e foto (spec 011 RF14). */
  @Patch('me')
  @Roles(ROLES.STUDENT)
  async updateOwnProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<User> {
    return this.service.updateOwnProfile(user.sub, dto);
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
