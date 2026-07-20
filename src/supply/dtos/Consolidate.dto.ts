import { IsArray, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { LEVELS, type Level } from '../../types/student.level';
import { Module } from '../../types/student.supply';

/**
 * Consolidação: o cliente envia o material inteiro já montado (todos os
 * tópicos gerados) para persistência definitiva. O array `modules` é validado
 * em profundidade por Zod (`SupplyModulesSchema`) dentro do serviço — aqui só
 * garantimos que é um array não vazio, pois class-validator não valida o shape
 * profundo tão bem quanto o schema Zod que já é fonte de verdade.
 */
export class ConsolidateDto {
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @IsString()
  @IsNotEmpty()
  @IsEnum(LEVELS)
  level: Level;

  @IsArray()
  @IsNotEmpty()
  modules: Module[];

  constructor(studentId: string, level: Level, modules: Module[]) {
    this.studentId = studentId;
    this.level = level;
    this.modules = modules;
  }
}
