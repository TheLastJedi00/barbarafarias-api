import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { LegalService } from './legal.service';

/**
 * Leitura pública dos documentos jurídicos (spec 029 §4). Fica em
 * `documents/:type`, e não em `:type`, para não disputar o caminho com
 * `/legal/admin` e `/legal/me`.
 */
@Controller('legal/documents')
export class LegalController {
  constructor(private readonly service: LegalService) {}

  @Public()
  @Get(':type')
  current(@Param('type') type: string) {
    return this.service.getCurrent(type);
  }

  @Public()
  @Get(':type/versions')
  versions(@Param('type') type: string) {
    return this.service.listVersions(type);
  }

  @Public()
  @Get(':type/versions/:version')
  version(@Param('type') type: string, @Param('version') version: string) {
    return this.service.getVersion(type, version);
  }
}
