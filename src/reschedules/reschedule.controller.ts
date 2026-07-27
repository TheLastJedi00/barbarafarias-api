import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RescheduleService } from './reschedule.service';
import {
  CreateRescheduleDto,
  DecisionDto,
} from './dto/create-reschedule.dto';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';

/** Solicitações abertas a partir de uma aula. */
@Controller('lessons')
export class LessonRescheduleController {
  constructor(private readonly service: RescheduleService) {}

  @Get(':id/reschedule-suggestion')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  suggest(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.suggestForNoShow(user, id);
  }

  @Post(':id/reschedule-requests')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateRescheduleDto,
  ) {
    return this.service.request(user, id, dto);
  }
}

/** Fila de aprovação da gerente + acompanhamento da professora. */
@Controller('reschedule-requests')
export class RescheduleController {
  constructor(private readonly service: RescheduleService) {}

  @Get()
  @Roles(ROLES.MANAGER)
  listPending() {
    return this.service.listPending();
  }

  @Get('mine')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listMine(user.sub);
  }

  @Post(':id/approve')
  @Roles(ROLES.MANAGER)
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.service.approve(user, id, dto.note);
  }

  @Post(':id/reject')
  @Roles(ROLES.MANAGER)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.service.reject(user, id, dto.note);
  }
}
