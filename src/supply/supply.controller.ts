import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SupplyService } from './supply.service';
import { SupplyInfoDto } from './dtos/SupplyInfo.dto';
import { TopicRequestDto } from './dtos/TopicRequest.dto';
import { ConsolidateDto } from './dtos/Consolidate.dto';
import type { Level } from '../types/student.level';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';
import { Supply } from './supply.model';
import { SkeletonModuleWithId, type Topic } from '../types/student.supply';

@Controller('/supplies')
export class SupplyController {
  constructor(private readonly supplyService: SupplyService) {}

  /** Etapa 1 — planta baixa (módulos + títulos de tópicos). */
  @Post('skeleton')
  @Roles(ROLES.TEACHER)
  async generateSkeleton(
    @Body() data: SupplyInfoDto,
  ): Promise<{ modules: SkeletonModuleWithId[] }> {
    return this.supplyService.generateSkeleton(data);
  }

  /** Etapa 2 — geração granular de um único tópico. */
  @Post('topic')
  @Roles(ROLES.TEACHER)
  async generateTopic(@Body() data: TopicRequestDto): Promise<Topic> {
    return this.supplyService.generateTopic(data);
  }

  /** Etapa 3 — consolida o material completo e persiste. */
  @Post('consolidate')
  @Roles(ROLES.TEACHER)
  async consolidate(@Body() data: ConsolidateDto): Promise<Supply> {
    return this.supplyService.consolidate(data);
  }

  @Get(':studentId')
  async getSupplies(@Param('studentId') studentId: string): Promise<Supply[]> {
    return this.supplyService.findSuppliesByStudentId(studentId);
  }

  @Get(':studentId/:level')
  async getSupplyByLevel(
    @Param('studentId') studentId: string,
    @Param('level') level: Level,
  ): Promise<Supply | null> {
    return this.supplyService.findSupplyByStudentAndLevel(studentId, level);
  }
}
