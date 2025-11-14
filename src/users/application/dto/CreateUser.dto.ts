import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class CreateUserDto {
    @IsNotEmpty({message: "Name is required"})
    fullName: string;
    @IsString({message: "Phone is required"})
    phone: string;
    @IsEmail(undefined, {message: "Invalid email format"})
    email: string;
    @IsString({message: "Password is required"})
    password: string;
    @IsString({message: "Objectives is required"})
    objectives: string;
    @IsString({message: "Prognosys is required"})
    prognosys: string;
}