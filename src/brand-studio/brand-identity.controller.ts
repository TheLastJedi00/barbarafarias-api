import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import { BrandIdentityService } from './brand-identity.service';
import { CreateIdentityDto, UpdateIdentityDto } from './dto/brand-identity.dto';

/** Identidades visuais da Campanha (spec 031 §2). Só a gerente. */
@Controller('brand-studio/identities')
@Roles(ROLES.MANAGER)
export class BrandIdentityController {
  constructor(private readonly service: BrandIdentityService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(
    @Body() dto: CreateIdentityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user);
  }

  /** Declarada antes de `:id` para "default" não cair na rota genérica. */
  @Post('default/reset')
  @HttpCode(HttpStatus.OK)
  resetDefault(@CurrentUser() user: AuthenticatedUser) {
    return this.service.resetDefault(user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIdentityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
