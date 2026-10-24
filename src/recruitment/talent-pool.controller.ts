import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';
import { ApplicationService } from './application.service';
import { CandidateService } from './candidate.service';

/**
 * Banco de talentos da gerente (spec 028): todo candidato cadastrado.
 *
 * Mora em `talent-pool`, e não em `candidates/:id`, para não disputar a rota
 * com `candidates/me` do próprio candidato — a ordem de registro dos
 * controllers decidiria quem atende, e um `:id` na frente devolveria 403 ao
 * candidato.
 */
@Controller('recruitment/talent-pool')
@Roles(ROLES.MANAGER)
export class TalentPoolController {
  constructor(
    private readonly applications: ApplicationService,
    private readonly candidates: CandidateService,
  ) {}

  @Get()
  list() {
    return this.applications.listTalentPool();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.applications.getCandidateDetail(id);
  }

  @Get(':id/resume/download')
  resumeDownload(@Param('id') id: string) {
    return this.candidates.resumeDownloadUrl(id);
  }
}
