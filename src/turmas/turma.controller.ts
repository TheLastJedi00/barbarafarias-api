import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { TurmaService } from './turma.service';
import { CreateTurmaDto } from './dto/create-turma.dto';
import { UpdateTurmaDto } from './dto/update-turma.dto';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';
import { TurmaFormingService } from './turma-forming.service';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import {
  CreateFormingTurmaDto,
  UpdateFormingTurmaDto,
} from './dto/forming-turma.dto';

@Controller('turmas')
export class TurmaController {
  constructor(
    private readonly turmaService: TurmaService,
    private readonly forming: TurmaFormingService,
  ) {}

  // ---------------------------------------------- turma em formação (036)
  // Rotas literais antes de `:id`, para o Nest não ler "forming" como id.

  /** Turmas da spec 036, para a Gestão › Turmas. */
  @Get('forming')
  @Roles(ROLES.MANAGER)
  findForming() {
    return this.forming.findForming();
  }

  @Post('forming')
  @Roles(ROLES.MANAGER)
  createForming(
    @Body() dto: CreateFormingTurmaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.forming.create(dto, user.sub);
  }

  @Patch('forming/:id')
  @Roles(ROLES.MANAGER)
  updateForming(@Param('id') id: string, @Body() dto: UpdateFormingTurmaDto) {
    return this.forming.update(id, dto);
  }

  // ------------------------------------------------- turmas da professora

  @Get()
  @Roles(ROLES.TEACHER)
  findAll() {
    return this.turmaService.findAll();
  }

  @Post()
  @Roles(ROLES.TEACHER)
  create(@Body() dto: CreateTurmaDto) {
    return this.turmaService.create(dto);
  }

  @Put(':id')
  @Roles(ROLES.TEACHER)
  update(@Param('id') id: string, @Body() dto: UpdateTurmaDto) {
    return this.turmaService.update(id, dto);
  }

  @Delete(':id')
  @Roles(ROLES.TEACHER)
  delete(@Param('id') id: string) {
    return this.turmaService.delete(id);
  }
}
