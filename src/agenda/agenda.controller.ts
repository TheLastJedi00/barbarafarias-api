import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { AssignSlotDto } from './dto/assign-slot.dto';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';

@Controller('agenda')
export class AgendaController {
  constructor(private readonly agendaService: AgendaService) {}

  @Get()
  @Roles(ROLES.TEACHER)
  getGrid() {
    return this.agendaService.getGrid();
  }

  // Sem @Roles: acessível a qualquer usuário autenticado (o aluno vê o próprio horário).
  @Get('student/:studentId')
  getStudentSchedule(@Param('studentId') studentId: string) {
    return this.agendaService.getStudentSchedule(studentId);
  }

  @Post()
  @Roles(ROLES.TEACHER)
  assign(@Body() dto: AssignSlotDto) {
    return this.agendaService.assign(dto);
  }

  @Delete(':dayOfWeek/:hour')
  @Roles(ROLES.TEACHER)
  free(
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
    @Param('hour', ParseIntPipe) hour: number,
  ) {
    return this.agendaService.free(dayOfWeek, hour);
  }
}
