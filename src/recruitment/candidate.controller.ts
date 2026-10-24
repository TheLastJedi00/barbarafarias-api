import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../decorators/public.decorator';
import { CandidateService } from './candidate.service';
import { CandidateSignupDto } from './dto/candidate.dto';

/** Conta do candidato (spec 028). Toda rota `me` usa o `sub` do token. */
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
}
