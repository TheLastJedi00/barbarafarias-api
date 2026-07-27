import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthRepository } from './auth.repository';
import { BcryptService } from './bcrypt.service';
import { AuthUser } from './entities/auth-user.entity';
import { Role, resolveRole } from '../types/role';
import { UserRepository } from '../users/user.repository';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private authRepository: AuthRepository,
    private bcryptService: BcryptService,
    private userRepository: UserRepository,
  ) {}

  verifyToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch (e) {
      throw new UnauthorizedException('Token inválido');
    }
  }

  async registerCredentials(data: Partial<AuthUser>) {
    const hashedPassword = await this.bcryptService.transform(data.password!);
    const authUser = new AuthUser({
      ...data,
      password: hashedPassword,
    });
    await this.authRepository.save(authUser);
  }

  async removeCredentials(id: string) {
    await this.authRepository.delete(id);
  }

  async login(email: string, pass: string) {
    const authUser = await this.authRepository.findByEmail(email);

    if (!authUser || !authUser.password) {
      throw new UnauthorizedException('Esse usuário não existe.');
    }

    const isMatch = await this.bcryptService.compare(pass, authUser.password);

    if (!isMatch) {
      throw new UnauthorizedException('Senha incorreta.');
    }

    return {
      access_token: this.jwtService.sign({
        email: authUser.email,
        sub: authUser.id,
        role: await this.resolveUserRole(authUser),
      }),
    };
  }

  /**
   * **`users.role` é a fonte única do papel.** É o campo que todas as
   * consultas do servidor usam (listar professoras, achar as gerentes,
   * filtrar alunos) — o Firestore não faz join, então o papel precisa morar
   * no documento consultado.
   *
   * `credentials.role` fica como **ponte de transição**: quem ainda não tem
   * `users.role` continua entrando com o papel certo, e um rollback do deploy
   * volta a funcionar sem ninguém ficar trancado. Some depois que a base
   * estiver migrada.
   *
   * Ordem: `users.role` → `credentials.role` → `isTeacher` (legado) →
   * `student` (menor privilégio).
   */
  private async resolveUserRole(authUser: AuthUser): Promise<Role> {
    const user = await this.userRepository.findById(authUser.id);
    return resolveRole({
      role: user?.role ?? authUser.role,
      isTeacher: user?.isTeacher,
    });
  }
}
