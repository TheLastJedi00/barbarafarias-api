import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthRepository } from './auth.repository';
import { BcryptService } from './bcrypt.service';
import { AuthUser } from './entities/auth-user.entity';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private authRepository: AuthRepository,
    private bcryptService: BcryptService,
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

  async login(email: string, pass: string) {
    const authUser = await this.authRepository.findByEmail(email);

    if (!authUser || !authUser.password) {
      throw new UnauthorizedException('Esse usuário não existe.');
    }

    const isMatch = await this.bcryptService.compare(pass, authUser.password);

    if (!isMatch) {
      throw new UnauthorizedException('Senha incorreta.');
    }

    const payload = { email: authUser.email, sub: authUser.id, role: authUser.role };
    
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
