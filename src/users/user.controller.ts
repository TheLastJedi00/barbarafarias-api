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
import { InviteUserDto } from './dto/InviteUser.dto';
import { UserService, missingOnboardingFields } from './user.service';
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
   * Convite de aluno só com o e-mail (spec 018 Task 101). Convive com o
   * cadastro completo acima: a gerente que já tem a ficha na mão matricula
   * direto, sem esperar o aluno preencher.
   */
  @Post('invite')
  @Roles(ROLES.MANAGER)
  async invite(@Body() dto: InviteUserDto): Promise<ResponseUserDto> {
    return this.service.inviteUser(dto.email);
  }

  /** Reenvia o e-mail de entrada de quem ainda não concluiu (Task 103). */
  @Post(':id/invite/resend')
  @Roles(ROLES.MANAGER)
  async resendInvite(@Param('id') id: string): Promise<void> {
    return this.service.resendInvite(id);
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
    const profile = await this.service.findById(user.sub);
    // `emailVerified` vem do próprio token que o guard já decodificou (spec 016
    // Task 78) — sem consulta extra ao Firebase, e sem virar campo do documento,
    // que sairia de sincronia no dia em que o e-mail fosse verificado.
    //
    // `missingOnboarding` é derivado aqui, e não no front (spec 018 Task 107):
    // é a mesma regra que decide gravar o `onboardedAt`, e duplicá-la no
    // Angular garantiria que as duas divergissem no primeiro campo novo.
    return Object.assign(profile, {
      emailVerified: user.emailVerified,
      missingOnboarding: missingOnboardingFields(profile),
    });
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
