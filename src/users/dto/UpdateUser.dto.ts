import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { LEVELS } from '../../types/student.level';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsBoolean()
  @IsOptional()
  isPaying?: boolean;

  @IsBoolean()
  @IsOptional()
  isTeacher?: boolean;

  /** Mesmo enum fechado do cadastro (spec 018 Task 106). */
  @IsIn(LEVELS, { message: `Nível deve ser um de: ${LEVELS.join(', ')}` })
  @IsOptional()
  level?: string;

  @IsString()
  @IsOptional()
  objective?: string;

  @IsString()
  @IsOptional()
  prognosis?: string;

  @IsString()
  @IsOptional()
  profileImageUrl?: string;
}
