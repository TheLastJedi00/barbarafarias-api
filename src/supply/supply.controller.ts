import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SupplyService } from './supply.service';
import { SupplyInfoDto } from './dtos/SupplyInfo.dto';
import { TopicRequestDto } from './dtos/TopicRequest.dto';
import { ConsolidateDto } from './dtos/Consolidate.dto';
import { ConsolidateModuleDto } from './dtos/ConsolidateModule.dto';
import { FinishConsolidationDto } from './dtos/FinishConsolidation.dto';
import type { Level } from '../types/student.level';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';
import { RequiresActivePlan } from '../guards/active-plan.guard';
import { Supply } from './supply.model';
import { SupplyHeader } from './supply.repository';
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

  /**
   * Etapa 3 — consolida o material completo numa tacada e persiste.
   * Mantida para materiais pequenos; grandes usam o par granular abaixo, que
   * não depende de o material inteiro caber num único corpo de requisição.
   */
  @Post('consolidate')
  @Roles(ROLES.TEACHER)
  async consolidate(@Body() data: ConsolidateDto): Promise<Supply> {
    return this.supplyService.consolidate(data);
  }

  /** Etapa 3a — consolidação granular: um módulo por requisição. */
  @Post('consolidate/module')
  @Roles(ROLES.TEACHER)
  async consolidateModule(
    @Body() data: ConsolidateModuleDto,
  ): Promise<SupplyHeader> {
    return this.supplyService.consolidateModule(data);
  }

  /** Etapa 3b — confere a completude e libera o material para o aluno. */
  @Post('consolidate/finish')
  @Roles(ROLES.TEACHER)
  async finishConsolidation(
    @Body() data: FinishConsolidationDto,
  ): Promise<Supply> {
    return this.supplyService.finishConsolidation(data);
  }

  /** Níveis com material pronto — só os cabeçalhos, sem o conteúdo. */
  @Get(':studentId')
  @RequiresActivePlan()
  async getSupplies(
    @Param('studentId') studentId: string,
  ): Promise<SupplyHeader[]> {
    return this.supplyService.findSuppliesByStudentId(studentId);
  }

  @Get(':studentId/:level')
  @RequiresActivePlan()
  async getSupplyByLevel(
    @Param('studentId') studentId: string,
    @Param('level') level: Level,
  ): Promise<Supply | null> {
    return this.supplyService.findSupplyByStudentAndLevel(studentId, level);
  }
}
