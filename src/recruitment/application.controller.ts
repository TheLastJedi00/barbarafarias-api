import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import { ApplicationService } from './application.service';

/** Candidaturas (spec 028). O candidato só age sobre as próprias (`sub`). */
@Controller('recruitment')
export class ApplicationController {
  constructor(private readonly service: ApplicationService) {}

  @Post('jobs/:id/apply')
  @Roles(ROLES.CANDIDATE)
  apply(@Param('id') jobId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.apply(user.sub, jobId);
  }

  @Delete('jobs/:id/apply')
  @Roles(ROLES.CANDIDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  withdraw(@Param('id') jobId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.withdraw(user.sub, jobId);
  }

  @Get('candidates/me/applications')
  @Roles(ROLES.CANDIDATE)
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listMine(user.sub);
  }
}
