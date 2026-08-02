import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  Min,
} from 'class-validator';
import { LEVELS, type Level } from '../../types/student.level';
import type { Module } from '../../types/student.supply';

/**
 * Consolidação granular (spec 011/B1.8): o cliente envia UM módulo por
 * requisição, em vez do material inteiro numa tacada. `moduleCount` viaja
 * junto para o backend saber quantos módulos esperar no `finish` sem depender
 * de estado de sessão.
 *
 * O `module` é validado em profundidade por Zod (`ModuleSchema`) dentro do
 * serviço — aqui só garantimos que é um objeto, pelo mesmo motivo do
 * `ConsolidateDto`: o schema Zod já é a fonte de verdade do formato.
 */
export class ConsolidateModuleDto {
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @IsString()
  @IsNotEmpty()
  @IsEnum(LEVELS)
  level: Level;

  @IsInt()
  @Min(0)
  index: number;

  @IsInt()
  @Min(1)
  moduleCount: number;

  @IsObject()
  module: Module;

  constructor(
    studentId: string,
    level: Level,
    index: number,
    moduleCount: number,
    module: Module,
  ) {
    this.studentId = studentId;
    this.level = level;
    this.index = index;
    this.moduleCount = moduleCount;
    this.module = module;
  }
}
