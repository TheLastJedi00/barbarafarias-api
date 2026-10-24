import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Public } from '../../decorators/public.decorator';
import type { RecruitmentTerms } from './recruitment-terms';
import { currentTerms, termsByVersion } from './recruitment-terms';

/**
 * Termo de tratamento de dados do Trabalhe Conosco (spec 028 §4). Público: o
 * cadastro mostra o link antes de existir conta, e é texto, não dado de
 * ninguém.
 */
@Controller('recruitment/terms')
export class RecruitmentTermsController {
  @Public()
  @Get()
  current(): RecruitmentTerms {
    return currentTerms();
  }

  /** Versões anteriores, para conferir o que cada aceite aceitou. */
  @Public()
  @Get(':version')
  byVersion(@Param('version') version: string): RecruitmentTerms {
    const terms = termsByVersion(version);
    if (!terms) throw new NotFoundException('Versão do termo não encontrada');
    return terms;
  }
}
