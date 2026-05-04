import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import type { Level } from '../../types/student.level';
import { Module } from '../../types/student.supply';

export class StudentSupplyDto {
  @IsUUID()
  @IsNotEmpty()
  studentId: string;
  @IsNotEmpty()
  level: Level;
  @IsNotEmpty()
  content: Module[];
}
