import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  IsBrazilianPhoneConstraint,
  IsCpfConstraint,
  onlyDigits,
} from '../../common/cpf.validator';

/**
 * Guarda só os dígitos e descarta o campo vazio. A máscara é assunto da tela:
 * gravar `(11) 99999-9999` obrigaria todo consumidor — o gateway inclusive —
 * a limpar a string antes de usar (spec 013 Task 45.2).
 */
const toDigits = () =>
  Transform(({ value }) => {
    const digits = onlyDigits(value);
    return digits.length > 0 ? digits : undefined;
  });

/**
 * Edição que o próprio usuário faz do seu perfil (spec 011 RF13/RF14).
 * Deliberadamente separado de `UpdateUserDto`: aqui só entram campos que o
 * dono da conta pode mexer. Papel, professora responsável, nível e situação
 * de pagamento continuam exclusivos da gerente — sem essa whitelist, um
 * aluno poderia se promover ou trocar de professora pelo próprio painel.
 */
export class BaseProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @toDigits()
  @IsString()
  @Validate(IsBrazilianPhoneConstraint)
  phone?: string;

  @IsString()
  @IsOptional()
  profileImageUrl?: string;
}

/** O que o aluno edita. O CPF entra aqui porque é ele quem paga. */
export class UpdateProfileDto extends BaseProfileDto {
  /**
   * O objetivo é do aluno, então é ele quem escreve (spec 018 decisão nº 1).
   *
   * `level` e `prognosis` continuam **fora** desta whitelist: o nível escolhe o
   * material que o sistema gera e o prognóstico é avaliação pedagógica — os
   * dois são da gerente/professora, e deixá-los passar por aqui seria o aluno
   * definindo a própria trilha.
   */
  @IsString()
  @IsOptional()
  @MaxLength(600)
  objective?: string;

  /**
   * Apresentação do aluno, exibida à professora na ficha (spec 018 Task 110).
   * Opcional em todos os sentidos: não entra no onboarding, porque é
   * apresentação e não requisito de entrada.
   */
  @IsString()
  @IsOptional()
  @MaxLength(600, { message: 'Bio deve ter no máximo 600 caracteres' })
  bio?: string;

  /**
   * Opcional no DTO de propósito, mesmo sendo obrigatório para assinar: este
   * `PATCH` é parcial e serve também ao upload de avatar, que manda só
   * `profileImageUrl`. Quem exige o CPF é o checkout (Task 45.3) e o
   * formulário do aluno.
   */
  @IsOptional()
  @toDigits()
  @IsString()
  @Validate(IsCpfConstraint)
  cpf?: string;
}

/**
 * O que a professora edita. Herda do base, não de `UpdateProfileDto`: o CPF
 * dela é dado fiscal do pagamento, cadastrado pela gerente em `/teachers` —
 * deixá-lo passar por aqui criaria um segundo lugar para editar a mesma
 * informação, com `whitelist: true` calado a respeito.
 */
export class UpdateTeacherProfileDto extends BaseProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(600, { message: 'Bio deve ter no máximo 600 caracteres' })
  bio?: string;

  @IsBoolean()
  @IsOptional()
  phoneVisibleToStudent?: boolean;
}
