import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SupplyService } from './supply.service';
import { Supply } from '../domain/models/supply.model';
import { SupplyInfoDto } from './dtos/SupplyInfo.dto';
import type { Level } from '../domain/types/student.level';

@Controller('/supplies')
export class SupplyController {
  constructor(private readonly supplyService: SupplyService) {}

  @Post()
  async createSupply(@Body() data: SupplyInfoDto): Promise<string> {
    return this.supplyService.createSupply(data);
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
