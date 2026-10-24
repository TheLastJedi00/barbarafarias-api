import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import { CandidateService } from './candidate.service';
import {
  CandidateSignupDto,
  ConsentDto,
  ResumeUploadDto,
  UpdateCandidateDto,
} from './dto/candidate.dto';

/**
 * Conta do candidato (spec 028). Nenhuma rota `me` recebe id: é sempre o
 * `sub` do token, então ninguém lê ou edita o perfil de outra pessoa.
 */
@Controller('recruitment/candidates')
export class CandidateController {
  constructor(private readonly service: CandidateService) {}

  /**
   * Cadastro público, com freio por IP. Mais apertado que o login: cada
   * chamada cria uma conta e põe um e-mail de verificação na caixa de alguém.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  signup(
    @Body() dto: CandidateSignupDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.service.signup(dto, {
      ip,
      userAgent: (userAgent ?? '').slice(0, 300),
    });
  }

  @Get('me')
  @Roles(ROLES.CANDIDATE)
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getMe(user.sub);
  }

  @Patch('me')
  @Roles(ROLES.CANDIDATE)
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCandidateDto,
  ) {
    return this.service.updateMe(user.sub, dto);
  }

  @Post('me/consent')
  @Roles(ROLES.CANDIDATE)
  acceptTerms(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConsentDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.service.acceptTerms(user.sub, dto, {
      ip,
      userAgent: (userAgent ?? '').slice(0, 300),
    });
  }

  /** A `origin` vai para a sessão do GCS devolver o CORS certo (spec 027). */
  @Post('me/resume')
  @Roles(ROLES.CANDIDATE)
  requestResumeUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ResumeUploadDto,
    @Headers('origin') origin?: string,
  ) {
    return this.service.requestResumeUpload(user.sub, dto, origin);
  }

  @Post('me/resume/complete')
  @Roles(ROLES.CANDIDATE)
  @HttpCode(HttpStatus.OK)
  completeResumeUpload(@CurrentUser() user: AuthenticatedUser) {
    return this.service.completeResumeUpload(user.sub);
  }

  @Get('me/resume/download')
  @Roles(ROLES.CANDIDATE)
  resumeDownload(@CurrentUser() user: AuthenticatedUser) {
    return this.service.resumeDownloadUrl(user.sub);
  }

  /**
   * "Excluir meus dados" (LGPD): definitivo. O ID Token continua válido até
   * expirar, então o front ainda chama `/auth/logout` para limpar o cookie.
   */
  @Delete('me')
  @Roles(ROLES.CANDIDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMe(@CurrentUser() user: AuthenticatedUser) {
    return this.service.deleteAll(user.sub);
  }
}
