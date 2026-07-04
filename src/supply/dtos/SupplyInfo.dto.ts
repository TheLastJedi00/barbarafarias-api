import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { LEVELS, type Level } from '../../types/student.level';

export class SupplyInfoDto {
  @IsString()
  @IsNotEmpty()
  studentId: string;
  @IsString()
  @IsNotEmpty()
  @IsEnum(LEVELS)
  level: Level;

  constructor(studentId: string, level: Level) {
    this.studentId = studentId;
    this.level = level;
  }
}
