import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateTeacherDto {
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  fullName!: string;

  @IsEmail(undefined, { message: 'E-mail inválido' })
  email!: string;

  @IsString({ message: 'Senha é obrigatória' })
  @IsNotEmpty({ message: 'Senha é obrigatória' })
  password!: string;

  @IsString({ message: 'Telefone é obrigatório' })
  @IsNotEmpty({ message: 'Telefone é obrigatório' })
  phone!: string;

  @IsString({ message: 'Chave PIX é obrigatória' })
  @IsNotEmpty({ message: 'Chave PIX é obrigatória' })
  pixKey!: string;

  @IsString({ message: 'CPF é obrigatório' })
  @IsNotEmpty({ message: 'CPF é obrigatório' })
  cpf!: string;

  @IsString()
  @IsOptional()
  cnpj?: string;

  @IsNumber({}, { message: 'Valor-hora deve ser numérico' })
  @Min(0)
  @IsOptional()
  hourlyRate?: number;

  @IsBoolean()
  @IsOptional()
  phoneVisibleToStudent?: boolean;
}
