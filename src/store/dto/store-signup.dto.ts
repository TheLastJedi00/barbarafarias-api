import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';
import {
  IsBrazilianPhoneConstraint,
  onlyDigits,
} from '../../common/cpf.validator';

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/**
 * Cadastro público da loja (spec 032 §6). CPF fica para o checkout, que é
 * quando o gateway o exige. Aceites são `true` e nada mais (`@Equals`).
 */
export class StoreSignupDto {
  @trim()
  @IsEmail(undefined, { message: 'E-mail inválido' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'A senha precisa ter pelo menos 8 caracteres' })
  @MaxLength(128)
  password!: string;

  @trim()
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  @MaxLength(120)
  fullName!: string;

  @Transform(({ value }) => onlyDigits(value))
  @IsString()
  @Validate(IsBrazilianPhoneConstraint)
  phone!: string;

  @Equals(true, { message: 'É preciso aceitar os Termos de Uso' })
  acceptTermsOfUse!: boolean;

  @Equals(true, { message: 'É preciso aceitar a Política de Privacidade' })
  acceptPrivacyPolicy!: boolean;
}
