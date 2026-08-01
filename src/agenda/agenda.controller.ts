import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseFloatPipe,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { AssignSlotDto } from './dto/assign-slot.dto';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';

@Controller('agenda')
export class AgendaController {
  constructor(private readonly agendaService: AgendaService) {}

  @Get()
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  getGrid(
    @CurrentUser() user: AuthenticatedUser,
    @Query('teacherId') teacherId?: string,
  ) {
    return this.agendaService.getGrid(
      this.agendaService.resolveScope(user, teacherId),
    );
  }

  // Sem @Roles: acessível a qualquer usuário autenticado (o aluno vê o próprio horário).
  @Get('student/:studentId')
  getStudentSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
  ) {
    if (user.role === ROLES.STUDENT && user.sub !== studentId) {
      throw new ForbiddenException('Sem acesso ao horário de outro aluno');
    }
    return this.agendaService.getStudentSchedule(studentId);
  }

  @Post()
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  assign(@CurrentUser() user: AuthenticatedUser, @Body() dto: AssignSlotDto) {
    const teacherId = this.agendaService.resolveScope(user, dto.teacherId) ?? user.sub;
    return this.agendaService.assign({ ...dto, teacherId });
  }

  /** `hour` é decimal (8.5 = 08:30), por isso ParseFloat e não ParseInt. */
  @Delete(':teacherId/:dayOfWeek/:hour')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  free(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teacherId') teacherId: string,
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
    @Param('hour', ParseFloatPipe) hour: number,
  ) {
    const scoped = this.agendaService.resolveScope(user, teacherId);
    return this.agendaService.free(scoped!, dayOfWeek, hour);
  }
}
