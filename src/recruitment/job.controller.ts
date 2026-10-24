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
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import { JobService } from './job.service';
import { CreateJobDto, UpdateJobDto } from './dto/job.dto';

/** Vagas do Trabalhe Conosco (spec 028). A leitura das abertas é pública. */
@Controller('recruitment/jobs')
export class JobController {
  constructor(private readonly service: JobService) {}

  /** Vitrine: só vagas abertas, só campos de exibição. */
  @Public()
  @Get()
  listOpen() {
    return this.service.listOpen();
  }

  @Get('all')
  @Roles(ROLES.MANAGER)
  listAll() {
    return this.service.listAll();
  }

  @Post()
  @Roles(ROLES.MANAGER)
  create(@Body() dto: CreateJobDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @Roles(ROLES.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateJobDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(ROLES.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
