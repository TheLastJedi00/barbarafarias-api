import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService, SessionResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, RefreshDto } from './dto/session.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Limite de tentativas só aqui, e não como guard global (spec 016 Task 76):
 * global, ele atingiria os webhooks do Stripe e do AbacatePay, e uma rajada de
 * eventos legítimos viraria pagamento não processado.
 */
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Login pelo Firebase (spec 016). O front continua chamando esta rota e
   * lendo o `access_token` — o que mudou é quem emite o token e que agora vem
   * um `refresh_token` junto, porque o ID Token dura uma hora.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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
  // Mais apertado que o login: cada chamada põe um e-mail na caixa de alguém.
  // O intervalo por endereço mora no EmailCooldownService — este freio é por IP.
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('recuperar-senha')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.authService.sendPasswordReset(dto.email);
  }

  /**
   * Reenvia a verificação de e-mail (Task 78). O próprio bearer token da
   * requisição é a credencial que o Firebase exige — por isso ele é lido do
   * header aqui em vez de reconstruído.
   */
  @Post('reenviar-verificacao')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('authorization') authorization: string,
  ): Promise<void> {
    const idToken = authorization.replace(/^Bearer /i, '');
    await this.authService.resendVerification(idToken, user.email);
  }

  /** Troca o e-mail da conta, exigindo a senha atual (Task 79). */
  @Patch('email')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeEmailDto,
  ): Promise<void> {
    await this.authService.changeEmail(
      user.sub,
      user.email,
      dto.novoEmail,
      dto.senhaAtual,
    );
  }
}
