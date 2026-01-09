import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SupplyService } from './supply.service';
import { Supply } from '../domain/models/supply.model';
import { SupplyInfoDto } from './dtos/SupplyInfo.dto';
import type { Level } from '../domain/types/student.level';
import { Roles } from 'src/auth/infrastructure/decorators/roles.decorator';
import { FirebaseAuthGuard } from 'src/auth/infrastructure/firebase.guard';
import { RolesGuard } from 'src/auth/infrastructure/roles.guard';

@Controller('/supplies')
@UseGuards(FirebaseAuthGuard)
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
