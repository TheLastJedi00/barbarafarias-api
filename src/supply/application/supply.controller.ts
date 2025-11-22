import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { SupplyService } from './supply.service';
import { StudentSupplyDto } from './dtos/CreateSupply.dto';
import { Supply } from '../domain/supply.model';

@Controller('/supplies')
export class SupplyController {
  constructor(private readonly supplyService: SupplyService) {}

  @Post()
  async createSupply(@Body() data: StudentSupplyDto): Promise<void> {
    return this.supplyService.createSupply(data);
  }

  @Get(':studentId')
  async getSupplies(@Param('studentId') studentId: string): Promise<Supply[]> {
    return this.supplyService.findSuppliesByStudentId(studentId);
  }

  @Get(':studentId/:level')
  async getSupplyByLevel(
    @Param('studentId') studentId: string,
    @Param('level') level: string,
  ): Promise<Supply | null> {
    return this.supplyService.findSupplyByStudentAndLevel(studentId, level);
  }

  @Put()
  async updateSupply(@Body() data: StudentSupplyDto): Promise<void> {
    return this.supplyService.updateSupply(data);
  }

  @Delete(':studentId/:level')
  async deleteSupply(
    @Param('studentId') studentId: string,
    @Param('level') level: string,
  ): Promise<void> {
    return this.supplyService.deleteSupply(studentId, level);
  }
}
