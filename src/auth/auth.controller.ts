import { Body, Controller, Post } from '@nestjs/common';
import { AuthService, SessionResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Login pelo Firebase (spec 016). O front continua chamando esta rota e
   * lendo o `access_token` — o que mudou é quem emite o token e que agora vem
   * um `refresh_token` junto, porque o ID Token dura uma hora.
   */
  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto): Promise<SessionResponse> {
    return this.authService.login(loginDto.email, loginDto.password);
  }
}
