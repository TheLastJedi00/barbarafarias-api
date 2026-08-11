import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { LEVELS } from '../../types/student.level';

export class CreateUserDto {
  @IsNotEmpty({ message: 'Name is required' })
  fullName!: string;
  @IsString({ message: 'Phone is required' })
  phone!: string;
  @IsEmail(undefined, { message: 'Invalid email format' })
  email!: string;
  @IsBoolean({ message: 'isPaying must be a boolean' })
  isPaying!: boolean;
  @IsBoolean({ message: 'isTeacher must be a boolean' })
  isTeacher!: boolean;
  /**
   * Enum fechado (spec 018 Task 106). Antes era `@IsString()` livre: uma string
   * fora da lista era gravada sem reclamar e só quebrava mais tarde, na geração
   * de material, longe da tela que a causou.
   */
  @IsIn(LEVELS, { message: `Nível deve ser um de: ${LEVELS.join(', ')}` })
  level!: string;
  @IsString({ message: 'Password is required' })
  password!: string;
  @IsString({ message: 'Objectives is required' })
  objective!: string;
  @IsString({ message: 'Prognosys is required' })
  prognosis!: string;
}
