import { IsEmail, IsNotEmpty, IsString } from "class-validator";
import { IsEmailUnique } from "../../infrastructure/decorators/isEmailUnique.decorator";

export class CreateUserDto {
    @IsNotEmpty({message: "Name is required"})
    fullName: string;
    @IsString({message: "Phone is required"})
    phone: string;
    @IsEmail(undefined, {message: "Invalid email format"})
    @IsEmailUnique({message: "Email already exists"})
    email: string;
    @IsNotEmpty({message: "this user is paying or not?"})
    isPaying: boolean;
    @IsNotEmpty({message: "this user is a teacher or not?"})
    isTeacher: boolean;
    @IsString({message: "Level is required"})
    level: string;
    @IsString({message: "Password is required"})
    password: string;
    @IsString({message: "Objectives is required"})
    objectives: string;
    @IsString({message: "Prognosys is required"})
    prognosis: string;
}