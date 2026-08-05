import { IsEmail, IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @MinLength(1)
  refresh_token!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email!: string;
}
