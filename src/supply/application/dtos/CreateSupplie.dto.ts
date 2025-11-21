import { IsNotEmpty, IsString, IsUUID } from "class-validator";
import type { Level } from "src/supply/domain/types/student.level";
import { Module } from "src/supply/domain/types/student.supply";

export class StudentSupplyDto {
  @IsUUID()
  @IsNotEmpty()
  studentId: string;
  @IsNotEmpty()
  level: Level;
  @IsNotEmpty()
  content: Module[]
}