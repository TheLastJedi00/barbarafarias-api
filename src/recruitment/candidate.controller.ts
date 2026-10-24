import {
  Body,
  Controller,
  Get,
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
  signup(@Body() dto: CandidateSignupDto) {
    return this.service.signup(dto);
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

  /** O `ConsentDto` só existe para exigir o `acceptTerms: true` explícito. */
  @Post('me/consent')
  @Roles(ROLES.CANDIDATE)
  acceptTerms(
    @CurrentUser() user: AuthenticatedUser,
    @Body() _dto: ConsentDto,
  ) {
    return this.service.acceptTerms(user.sub);
  }
}
