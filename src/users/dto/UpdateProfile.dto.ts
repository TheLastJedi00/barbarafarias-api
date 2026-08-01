import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Edição que o próprio usuário faz do seu perfil (spec 011 RF13/RF14).
 * Deliberadamente separado de `UpdateUserDto`: aqui só entram campos que o
 * dono da conta pode mexer. Papel, professora responsável, nível e situação
 * de pagamento continuam exclusivos da gerente — sem essa whitelist, um
 * aluno poderia se promover ou trocar de professora pelo próprio painel.
 */
export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  fullName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @IsOptional()
  profileImageUrl?: string;
}

export class UpdateTeacherProfileDto extends UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(600, { message: 'Bio deve ter no máximo 600 caracteres' })
  bio?: string;

  @IsBoolean()
  @IsOptional()
  phoneVisibleToStudent?: boolean;
}
