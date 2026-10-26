import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** O texto vai inteiro no prompt; 20 mil caracteres cobrem uma identidade detalhada. */
const MAX_CONTENT = 20_000;

export class CreateIdentityDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  @MaxLength(80)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'Descreva a identidade' })
  @MaxLength(MAX_CONTENT)
  content!: string;
}

export class UpdateIdentityDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Descreva a identidade' })
  @MaxLength(MAX_CONTENT)
  content?: string;
}
