import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
} from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';
import { LEVELS, Level } from '../types/student.level';
import { CurriculumService } from './curriculum.service';
import { UpsertLevelDto } from './dto/upsert-level.dto';
import { UpsertPrincipalDto } from './dto/upsert-principal.dto';

@Controller('curriculum')
export class CurriculumController {
  constructor(private readonly service: CurriculumService) {}

  @Get('principal')
  @Roles(ROLES.TEACHER)
  getPrincipal() {
    return this.service.getPrincipal();
  }

  @Put('principal')
  @Roles(ROLES.TEACHER)
  upsertPrincipal(@Body() dto: UpsertPrincipalDto) {
    return this.service.upsertPrincipal(dto);
  }

  @Get('levels/:level')
  @Roles(ROLES.TEACHER)
  getLevel(@Param('level') level: string) {
    return this.service.getLevel(this.parseLevel(level));
  }

  @Put('levels/:level')
  @Roles(ROLES.TEACHER)
  upsertLevel(@Param('level') level: string, @Body() dto: UpsertLevelDto) {
    return this.service.upsertLevel(this.parseLevel(level), dto);
  }

  @Get('levels/:level/blueprint')
  @Roles(ROLES.TEACHER)
  getBlueprint(@Param('level') level: string) {
    return this.service.getBlueprint(this.parseLevel(level));
  }

  /** Garante que o nível da rota é um dos LEVELS válidos (A1..B2). */
  private parseLevel(level: string): Level {
    if (!(LEVELS as readonly string[]).includes(level)) {
      throw new BadRequestException(
        `Nível inválido: "${level}". Use um de ${LEVELS.join(', ')}.`,
      );
    }
    return level as Level;
  }
}
