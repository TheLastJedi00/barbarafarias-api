import { IsBoolean, IsEmail, IsNotEmpty, IsString } from 'class-validator';

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
  @IsString({ message: 'Level is required' })
  level!: string;
  @IsString({ message: 'Password is required' })
  password!: string;
  @IsString({ message: 'Objectives is required' })
  objective!: string;
  @IsString({ message: 'Prognosys is required' })
  prognosis!: string;
}
