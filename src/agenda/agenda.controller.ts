import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { AssignSlotDto } from './dto/assign-slot.dto';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';

@Controller('agenda')
export class AgendaController {
  constructor(private readonly agendaService: AgendaService) {}

  @Get()
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  getGrid(@Query('teacherId') teacherId?: string) {
    return this.agendaService.getGrid(teacherId);
  }

  // Sem @Roles: acessível a qualquer usuário autenticado (o aluno vê o próprio horário).
  @Get('student/:studentId')
  getStudentSchedule(@Param('studentId') studentId: string) {
    return this.agendaService.getStudentSchedule(studentId);
  }

  @Post()
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  assign(@Body() dto: AssignSlotDto) {
    return this.agendaService.assign(dto);
  }

  @Delete(':teacherId/:dayOfWeek/:hour')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  free(
    @Param('teacherId') teacherId: string,
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
    @Param('hour', ParseIntPipe) hour: number,
  ) {
    return this.agendaService.free(teacherId, dayOfWeek, hour);
  }
}
