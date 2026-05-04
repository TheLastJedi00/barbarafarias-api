import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SupplyService } from './supply.service';
import { SupplyInfoDto } from './dtos/SupplyInfo.dto';
import type { Level } from '../types/student.level';
import { Roles } from '../decorators/roles.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Supply } from './entities/supply.model';

@Controller('/supplies')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class SupplyController {
  constructor(private readonly supplyService: SupplyService) {}

  @Post()
  @Roles('teacher')
  async createSupply(@Body() data: SupplyInfoDto): Promise<SupplyInfoDto> {
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
