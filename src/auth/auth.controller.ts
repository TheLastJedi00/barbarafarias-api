import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService, SessionResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, RefreshDto } from './dto/session.dto';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

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

  /**
   * Renova a sessão (spec 016 Task 73). Pública porque o ID Token que ela
   * emite é justamente o que falta a quem chama: exigir autenticação aqui
   * inviabilizaria a única situação em que a rota é usada.
   */
  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto): Promise<SessionResponse> {
    return this.authService.refresh(dto.refresh_token);
  }

  /**
   * Sai de **todos** os aparelhos, revogando os refresh tokens (Task 74).
   * É o que dá sentido a "sair" agora que a sessão sobrevive ao fechamento da
   * aba — e o que o suporte precisa quando alguém perde o celular.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logout(user.sub);
  }

  /**
   * Dispara o e-mail de redefinição pelo Firebase (Task 75). Responde 204
   * mesmo para e-mail inexistente — ver `AuthService.sendPasswordReset`.
   */
  @Public()
  @Post('recuperar-senha')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.authService.sendPasswordReset(dto.email);
  }
}
