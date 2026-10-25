import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AllowCandidate } from '../decorators/allow-candidate.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { LegalService } from './legal.service';
import { AcceptLegalDto } from './dto/legal.dto';

/**
 * Aceite dos documentos jurídicos por quem está logado (spec 029 §3) — todo
 * papel, inclusive o candidato. É a saída do modal bloqueante do front, então
 * não depende de aceite nenhum para responder.
 */
@Controller('legal/me')
@AllowCandidate()
export class LegalMeController {
  constructor(private readonly service: LegalService) {}

  @Get('pending')
  pending(@CurrentUser() user: AuthenticatedUser) {
    return this.service.pending(user);
  }

  /** `trust proxy` está ligado no `main.ts`: o IP é o do cliente, não o da Vercel. */
  @Post('accept')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AcceptLegalDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.service.accept(user, dto.types, {
      ip,
      userAgent: (userAgent ?? '').slice(0, 300),
    });
  }
}
