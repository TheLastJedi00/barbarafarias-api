import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { LessonService } from './lesson.service';
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
