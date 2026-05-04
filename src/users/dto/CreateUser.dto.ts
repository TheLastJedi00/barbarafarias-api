import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty({ message: 'Name is required' })
  fullName!: string;
  @IsString({ message: 'Phone is required' })
  phone!: string;
  @IsEmail(undefined, { message: 'Invalid email format' })
  email!: string;
  @IsNotEmpty({ message: 'this user is paying or not?' })
  isPaying!: boolean;
  @IsNotEmpty({ message: 'this user is a teacher or not?' })
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
