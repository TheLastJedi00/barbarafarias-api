import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from './user.entity';
import { CreateUserDto } from './dto/CreateUser.dto';
import { UpdateUserDto } from './dto/UpdateUser.dto';
import { UpdateProfileDto } from './dto/UpdateProfile.dto';
import { pickDefined } from '../common/patch';
import { ResponseUserDto } from './dto/ResponseUser.dto';
import { UserRepository } from './user.repository';
import { onboardingCompletedAt } from './onboarding';
import { AuthService } from '../auth/auth.service';
import { ROLES, Role, resolveRole } from '../types/role';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { randomUUID } from 'node:crypto';

/**
 * A régua do onboarding mora em `./onboarding` desde a Fase 7 da spec 018 —
 * professora também passa por ela, e o módulo de professoras não deveria
 * importar este serviço inteiro para conhecê-la. Reexportado porque o
 * controller e os testes já apontavam para cá.
 */
export { missingOnboardingFields } from './onboarding';

@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private authService: AuthService,
  ) {}

  async createUser(dto: CreateUserDto): Promise<ResponseUserDto> {
    const uid = randomUUID();
    const role = dto.isTeacher ? ROLES.TEACHER : ROLES.STUDENT;

    await this.authService.createAccount({
      uid,
      email: dto.email,
      password: dto.password,
      role,
    });

    try {
      // nasce já migrado: grava `role` junto do `isTeacher` legado
      const { password, ...userFields } = dto;
      const user = new User({ ...userFields, role });
      user.id = uid;
      const id = await this.userRepository.save(user, uid);
      return new ResponseUserDto(id, user.fullName);
    } catch (error) {
      // rollback: evita conta órfã caso a gravação do usuário falhe
      await this.authService.deleteAccount(uid);
      throw error;
    }
  }

  /**
   * Convida um aluno com o e-mail e mais nada (spec 018 Task 101).
   *
   * A senha é aleatória e **descartável**: ninguém a vê, ninguém a guarda, e o
   * aluno entra pelo e-mail de redefinição que sai daqui. Por isso o envio de
   * verificação do cadastro normal não serve — ele faz login com a senha para
   * obter um ID Token, e aqui a senha é lixo proposital. Não se perde nada: o
   * Firebase marca o endereço como verificado quando a redefinição termina, o
   * que prova a posse do e-mail do mesmo jeito.
   */
  async inviteUser(email: string): Promise<ResponseUserDto> {
    const uid = randomUUID();
    await this.authService.createAccount({
      uid,
      email,
      password: randomUUID(),
      role: ROLES.STUDENT,
      sendVerification: false,
    });

    try {
      // Sem `onboardedAt`: é a ausência dele que marca o convite pendente.
      const user = new User({
        email,
        role: ROLES.STUDENT,
        isTeacher: false,
        isPaying: false,
      });
      user.id = uid;
      await this.userRepository.save(user, uid);
    } catch (error) {
      // Mesmo rollback do cadastro completo: nada de conta órfã no Firebase.
      await this.authService.deleteAccount(uid);
      throw error;
    }

    await this.authService.sendPasswordReset(email);
    return new ResponseUserDto(uid, email);
  }

  /**
   * Reenvia o convite (spec 018 Task 103). É o mesmo e-mail de redefinição, e
   * portanto passa pela mesma trava de um minuto — a gerente que clicar duas
   * vezes recebe 429 com a mensagem explicando a espera, em vez do erro cru.
   */
  async resendInvite(id: string): Promise<void> {
    const user = await this.findById(id);
    if (user.onboardedAt) {
      throw new BadRequestException(
        'Este aluno já concluiu o cadastro. Não há convite a reenviar.',
      );
    }
    await this.authService.sendPasswordReset(user.email);
  }

  async getAllUsers(role?: Role): Promise<User[]> {
    return this.userRepository.findAll(role);
  }

  /**
   * Listagem já recortada pelo papel de quem pede (spec 011 RF2.1):
   * a gerente recebe a base inteira, a professora só os alunos vinculados
   * a ela. O filtro mora aqui — nenhuma rota devolve a base crua para quem
   * não é gerente.
   */
  async getUsersForRequester(
    requester: AuthenticatedUser,
    role?: Role,
  ): Promise<User[]> {
    const users = await this.userRepository.findAll(role);
    if (requester.role === ROLES.MANAGER) {
      return users;
    }
    return users.filter(
      (user) =>
        resolveRole(user) !== ROLES.STUDENT || user.teacherId === requester.sub,
    );
  }

  async updateUser(
    requester: AuthenticatedUser,
    id: string,
    dto: UpdateUserDto,
  ): Promise<User> {
    const foundUser = await this.userRepository.findById(id);
    if (!foundUser) {
      throw new NotFoundException('User not found');
    }
    this.assertCanReach(requester, id, foundUser);
    // merge over the existing user and pin the id from the route param,
    // so partial updates don't wipe fields nor depend on the request body id
    const user = new User({
      ...foundUser,
      ...this.withDerivedIsPaying(foundUser, dto),
      id,
    });
    await this.userRepository.update(user);
    return user;
  }

  /**
   * Ficha de um usuário, recortada por quem pede (spec 011 RF2.1).
   *
   * A gerente alcança qualquer um; a professora, a si mesma e os alunos
   * vinculados a ela; o aluno, só a si mesmo. Sem isso, `GET /users/:id`
   * entregava o documento cru — PIX, CPF, CNPJ, valor-hora e sala fixa — a
   * qualquer pessoa logada que soubesse um id.
   */
  async findByIdForRequester(
    requester: AuthenticatedUser,
    id: string,
  ): Promise<User> {
    const user = await this.findById(id);
    this.assertCanReach(requester, id, user);
    return this.withoutForeignCpf(requester, id, user);
  }

  /**
   * O CPF do aluno passou a existir com a spec 013 (é o `taxId` do pagador no
   * gateway). Esta rota devolve o documento inteiro, e a professora vinculada
   * a ele alcança a ficha de cada aluno — ela precisa de nível, objetivo e
   * sala, não do documento fiscal de quem paga. A gerente continua vendo tudo,
   * porque é ela quem responde pela cobrança.
   */
  private withoutForeignCpf(
    requester: AuthenticatedUser,
    id: string,
    user: User,
  ): User {
    if (requester.role === ROLES.MANAGER || requester.sub === id) {
      return user;
    }
    const { cpf, ...rest } = user;
    return new User(rest);
  }

  /**
   * `isPaying` deixa de ser um interruptor manual assim que o aluno tem uma
   * assinatura (spec 012 Task 18): quem manda passa a ser o status dela, que o
   * `SubscriptionService` espelha aqui. Uma edição manual seria desfeita na
   * próxima cobrança de qualquer jeito — descartá-la já evita que o painel da
   * gerente e a barreira de acesso discordem no meio do caminho.
   *
   * **Retrocompatibilidade:** aluno sem assinatura continua exatamente como
   * antes, com a gerente marcando o pagamento à mão. Não há migração forçada.
   */
  private withDerivedIsPaying(
    current: User,
    dto: UpdateUserDto,
  ): UpdateUserDto {
    if (!current.subscriptionStatus || dto.isPaying === undefined) {
      return dto;
    }
    const { isPaying, ...rest } = dto;
    return rest;
  }

  private assertCanReach(
    requester: AuthenticatedUser,
    id: string,
    target: User,
  ): void {
    if (requester.role === ROLES.MANAGER) return;
    if (requester.sub === id) return;
    if (
      requester.role === ROLES.TEACHER &&
      resolveRole(target) === ROLES.STUDENT &&
      target.teacherId === requester.sub
    ) {
      return;
    }
    throw new ForbiddenException('Sem acesso a este usuário');
  }

  /**
   * Atualização que o próprio usuário faz do seu perfil. Só os campos do
   * `UpdateProfileDto` são gravados — o resto do documento permanece como
   * está, para que a edição do aluno não alcance dados de gestão.
   */
  async updateOwnProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    const foundUser = await this.userRepository.findById(id);
    if (!foundUser) {
      throw new NotFoundException('User not found');
    }
    const patch = pickDefined(dto);
    const user = new User({ ...foundUser, ...patch, id });
    const concluido = onboardingCompletedAt(user);
    if (concluido) {
      user.onboardedAt = concluido;
    }
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

  /**
   * Apaga o documento **e** a conta de autenticação (spec 016 Task 80).
   *
   * Antes só o documento sumia, e a credencial órfã ficava — o efeito passava
   * despercebido porque o login antigo dependia de `users` para resolver o
   * papel. Com o Firebase, uma conta órfã continua conseguindo token: quem foi
   * removido da escola entraria e receberia 404 nas telas, em vez de não
   * entrar.
   *
   * O documento primeiro: se a conta sumisse antes e a exclusão do documento
   * falhasse, sobraria um aluno sem nenhum jeito de entrar e sem registro do
   * porquê.
   */
  async delete(id: string): Promise<void> {
    await this.userRepository.delete(id);
    await this.authService.deleteAccount(id);
  }
}
