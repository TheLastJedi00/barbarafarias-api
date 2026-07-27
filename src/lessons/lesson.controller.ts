import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { LessonService } from './lesson.service';
import { AttendanceDto } from './dto/attendance.dto';
import { RateLessonDto } from './dto/rate-lesson.dto';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import { todayInAppTimezone } from '../common/time';

@Controller('lessons')
export class LessonController {
  constructor(private readonly service: LessonService) {}

  @Get()
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  findRange(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('teacherId') teacherId?: string,
  ) {
    return this.service.findRange(user, from, to, teacherId);
  }

  @Get('day')
  @Roles(ROLES.MANAGER)
  findByDate(@Query('date') date?: string) {
    return this.service.findByDate(date || todayInAppTimezone());
  }

  /** Estado da janela + link do Meet (só quando aberta). */
  @Get(':id/access')
  getAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.getAccess(user, id);
  }

  /** Presença manual (gatilho secundário), até 72 h após a aula. */
  @Post(':id/attendance')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  markAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AttendanceDto,
  ) {
    return this.service.markAttendance(user, id, dto.present);
  }

  /** Aviso prévio de ausência do aluno (mínimo de 4 h). */
  @Post(':id/student-cancel')
  @Roles(ROLES.STUDENT)
  studentCancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.studentCancel(user, id);
  }

  @Post(':id/rating')
  @Roles(ROLES.STUDENT)
  rate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RateLessonDto,
  ) {
    return this.service.rateLesson(user, id, dto.stars, dto.comment);
  }

  @Get('student/:studentId')
  findByStudent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (user.role === ROLES.STUDENT && user.sub !== studentId) {
      throw new ForbiddenException('Sem acesso às aulas de outro aluno');
    }
    return this.service.findByStudent(studentId, from, to);
  }
}
