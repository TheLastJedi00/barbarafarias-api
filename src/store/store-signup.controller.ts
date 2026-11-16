import { Body, Controller, Headers, Ip, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../decorators/public.decorator';
import { StoreSignupDto } from './dto/store-signup.dto';
import { StoreSignupService } from './store-signup.service';

/** Cadastro público da loja (spec 032 §6). */
@Controller('store')
export class StoreSignupController {
  constructor(private readonly service: StoreSignupService) {}

  /**
   * Freio por IP, igual ao do Trabalhe Conosco: cada chamada cria uma conta e
   * põe um e-mail de verificação na caixa de alguém.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  signup(
    @Body() dto: StoreSignupDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.service.signup(dto, {
      ip,
      userAgent: (userAgent ?? '').slice(0, 300),
    });
  }
}
