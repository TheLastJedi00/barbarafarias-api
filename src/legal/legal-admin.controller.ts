import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import { LegalAdminService } from './legal-admin.service';
import { PublishDto, SaveDraftDto } from './dto/legal.dto';

/**
 * Painel Jurídico da gerente (spec 029 §2). Não há rota para alterar ou apagar
 * versão publicada — o "D" do CRUD é descartar o rascunho.
 */
@Controller('legal/admin')
@Roles(ROLES.MANAGER)
export class LegalAdminController {
  constructor(private readonly service: LegalAdminService) {}

  @Get()
  overview() {
    return this.service.overview();
  }

  @Get(':type/draft')
  getDraft(@Param('type') type: string) {
    return this.service.getDraft(type);
  }

  @Put(':type/draft')
  saveDraft(
    @Param('type') type: string,
    @Body() dto: SaveDraftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.saveDraft(type, dto, user);
  }

  @Delete(':type/draft')
  @HttpCode(HttpStatus.NO_CONTENT)
  discardDraft(@Param('type') type: string) {
    return this.service.discardDraft(type);
  }

  /** Irreversível: cria a versão seguinte. */
  @Post(':type/publish')
  publish(
    @Param('type') type: string,
    @Body() dto: PublishDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.publish(type, dto, user);
  }

  @Get(':type/acceptances')
  acceptances(@Param('type') type: string) {
    return this.service.getAcceptances(type);
  }
}
