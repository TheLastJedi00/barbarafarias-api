import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class CreateUserDto {
    @IsNotEmpty()
    fullName: string;
    @IsString()
    phone: string;
    @IsEmail()
    email: string;
    @IsString()
    password: string;
    @IsString()
    objectives: string;
    @IsString()
    prognosys: string;
}