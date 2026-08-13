import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, SessionResponse } from './auth.service';
import { SessionCookie } from './session-cookie';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, RefreshDto } from './dto/session.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * O que o front recebe (spec 021). É a `SessionResponse` **sem o
 * `refresh_token`**: ele passou a viajar em cookie `httpOnly`, e o corpo é
 * justamente a via pela qual o JavaScript o alcançaria.
 */
export interface ClientSession {
  access_token: string;
  expires_in: number;
}

/**
 * Limite de tentativas só aqui, e não como guard global (spec 016 Task 76):
 * global, ele atingiria o webhook do gateway de pagamento, e uma rajada de
 * eventos legítimos viraria pagamento não processado.
 */
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private sessionCookie: SessionCookie,
  ) {}

  /**
   * Login pelo Firebase (spec 016). O front continua chamando esta rota e
   * lendo o `access_token`; o `refresh_token` deixou de vir no corpo e passou a
   * ser gravado em cookie `httpOnly` (spec 021).
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ClientSession> {
    const session = await this.authService.login(
      loginDto.email,
      loginDto.password,
    );
    return this.entregar(session, res);
  }

  /**
   * Renova a sessão (spec 016 Task 73). Pública porque o ID Token que ela
   * emite é justamente o que falta a quem chama: exigir autenticação aqui
   * inviabilizaria a única situação em que a rota é usada.
   *
   * Lê o cookie e **cai no corpo** quando ele não existe (spec 021 §7.2): é o
   * que mantém o front da release anterior funcionando e o que converte, uma
   * única vez, o `bf.refresh` que ficou no `localStorage` das pessoas.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ClientSession> {
    const refreshToken = this.sessionCookie.read(req) ?? dto.refresh_token;
    if (!refreshToken) {
      // 401 e não 400: para o front "não tem cookie" e "o token não vale mais"
      // são o mesmo evento, e um 400 escaparia do tratamento de 401 do
      // interceptor — viraria tela de erro em vez de ida ao login.
      throw new UnauthorizedException('Sessão expirada. Entre novamente.');
    }
    return this.entregar(await this.authService.refresh(refreshToken), res);
  }

  /**
   * Sai de **todos** os aparelhos, revogando os refresh tokens (Task 74).
   * É o que dá sentido a "sair" agora que a sessão sobrevive ao fechamento da
   * aba — e o que o suporte precisa quando alguém perde o celular.
   *
   * O cookie é limpo **antes** da revogação: se o Firebase estiver fora, sair
   * mesmo assim tira a credencial do navegador. A ordem inversa deixaria a
   * pessoa na tela de login com a sessão intacta no aparelho.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    this.sessionCookie.clear(res);
    await this.authService.logout(user.sub);
  }

  /** Cookie para o navegador, ID Token para o JavaScript. */
  private entregar(session: SessionResponse, res: Response): ClientSession {
    this.sessionCookie.set(res, session.refresh_token);
    return {
      access_token: session.access_token,
      expires_in: session.expires_in,
    };
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
