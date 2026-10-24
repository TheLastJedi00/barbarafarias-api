import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../decorators/public.decorator';
import { LegalService } from '../../legal/legal.service';

/**
 * Termo do Trabalhe Conosco (spec 028 §4). Desde a spec 029 o texto mora no
 * Painel Jurídico (documento `recruitment`); estas rotas ficam pelo contrato
 * que o front já consome.
 */
@Controller('recruitment/terms')
export class RecruitmentTermsController {
  constructor(private readonly legal: LegalService) {}

  @Public()
  @Get()
  current() {
    return this.legal.getCurrent('recruitment');
  }

  /** Versões anteriores, para conferir o que cada aceite aceitou. */
  @Public()
  @Get(':version')
  byVersion(@Param('version') version: string) {
    return this.legal.getVersion('recruitment', version);
  }
}
