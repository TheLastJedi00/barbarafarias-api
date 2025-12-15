import { IsBoolean, IsEmail, IsOptional, IsString } from "class-validator";

export class UpdateUserDto {
    @IsString()
    @IsOptional()
    id: string;

    @IsString()
    @IsOptional()
    fullName: string;

    @IsString()
    @IsOptional()
    phone: string;

    @IsEmail()
    @IsOptional()
    email: string;

    @IsBoolean()
    @IsOptional()
    isPaying: boolean;

    @IsBoolean()
    @IsOptional()
    isTeacher: boolean;

    @IsString()
    @IsOptional()
    level: string;

    @IsString()
    @IsOptional()
    objective: string;

    @IsString()
    @IsOptional()
    prognosis: string;
}