import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';

@Controller('students/:studentId/feedbacks')
@Roles(ROLES.MANAGER, ROLES.TEACHER)
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Get()
  findByStudent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
  ) {
    return this.service.findByStudent(user, studentId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
    @Body() dto: CreateFeedbackDto,
  ) {
    return this.service.create(user, studentId, dto);
  }
}
