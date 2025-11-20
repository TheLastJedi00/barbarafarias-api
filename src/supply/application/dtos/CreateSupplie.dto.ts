import { IsNotEmpty, IsString, IsUUID } from "class-validator";
import { Module } from "src/supply/domain/types/student.supply";

export class StudentSupplyDto {
  @IsUUID()
  @IsNotEmpty()
  studentId: string;
  @IsNotEmpty()
  @IsString()
  level: 'A1' | 'A2' | 'B1' | 'B2';
  @IsNotEmpty()
  content: Module[]
}