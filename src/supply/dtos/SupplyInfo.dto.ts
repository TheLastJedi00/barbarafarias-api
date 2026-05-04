import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import type { Level } from '../../types/student.level';

export class SupplyInfoDto {
  @IsString()
  @IsNotEmpty()
  studentId: string;
  @IsString()
  @IsNotEmpty()
  @IsEnum(['A1', 'A2', 'B1', 'B2'])
  level: Level;

  constructor(studentId: string, level: Level) {
    this.studentId = studentId;
    this.level = level;
  }
}
