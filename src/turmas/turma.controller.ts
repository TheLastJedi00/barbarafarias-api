import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { TurmaService } from './turma.service';
import { CreateTurmaDto } from './dto/create-turma.dto';
import { UpdateTurmaDto } from './dto/update-turma.dto';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';

@Controller('turmas')
export class TurmaController {
  constructor(private readonly turmaService: TurmaService) {}

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
