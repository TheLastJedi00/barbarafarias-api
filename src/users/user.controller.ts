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

  /** Só a gerente cadastra alunos (spec 011 RF2.1). */
  @Post()
  @Roles(ROLES.MANAGER)
  async createUser(@Body() user: CreateUserDto): Promise<ResponseUserDto> {
    return this.service.createUser(user);
  }

  /**
   * A gerente enxerga a base inteira; a professora, apenas os alunos
   * vinculados a ela (spec 011 RF2.1) — o recorte é feito no service, não
   * pelo cliente.
   */
  @Get()
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  async getAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('role') role?: Role,
  ): Promise<User[]> {
    return this.service.getUsersForRequester(user, role);
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

  /**
   * Ficha de um usuário. Sem escopo, qualquer aluno autenticado lia o
   * documento cru de qualquer pessoa — inclusive PIX, CPF, CNPJ e valor-hora
   * das professoras (spec 010 RNF4). O recorte fica no service.
   */
  @Get(':id')
  async findById(
    @CurrentUser() requester: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<User> {
    return this.service.findByIdForRequester(requester, id);
  }

  /** Professora só edita aluno vinculado a ela (spec 011 RF2.1). */
  @Put(':id')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  async update(
    @CurrentUser() requester: AuthenticatedUser,
    @Param('id') id: string,
    @Body() user: UpdateUserDto,
  ): Promise<User> {
    return this.service.updateUser(requester, id, user);
  }
  /** Excluir aluno é ato de gestão, não de sala de aula (spec 011 RF2.1). */
  @Delete(':id')
  @Roles(ROLES.MANAGER)
  async delete(@Param('id') id: string): Promise<void> {
    return this.service.delete(id);
  }
}
