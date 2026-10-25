import {
  Equals,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  Validate,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  IsBrazilianPhoneConstraint,
  onlyDigits,
} from '../../common/cpf.validator';

/** Perfil do LinkedIn: `https://` + `linkedin.com` (com ou sem subdomínio). */
export const LINKEDIN_URL = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/\S+$/i;

const LINKEDIN_MESSAGE =
  'Informe o link completo do perfil (https://www.linkedin.com/in/...)';

/** Só dígitos: a máscara é da tela (mesma regra do perfil do aluno). */
const toDigits = () => Transform(({ value }) => onlyDigits(value));

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/**
 * Cadastro público do Trabalhe Conosco (spec 028). Aceite do termo e
 * declaração de maioridade são `true` e nada mais — `@Equals`, como no
 * checkout: um `false` que passasse seria um cadastro sem consentimento.
 */
export class CandidateSignupDto {
  @trim()
  @IsEmail(undefined, { message: 'E-mail inválido' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'A senha precisa ter pelo menos 8 caracteres' })
  @MaxLength(128)
  password!: string;

  @trim()
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  @MaxLength(120)
  name!: string;

  @toDigits()
  @IsString()
  @Validate(IsBrazilianPhoneConstraint)
  phone!: string;

  @IsOptional()
  @trim()
  @IsString()
  @Matches(LINKEDIN_URL, { message: LINKEDIN_MESSAGE })
  @MaxLength(300)
  linkedinUrl?: string;

  /** Spec 029: os documentos gerais do Painel Jurídico entram no cadastro. */
  @Equals(true, { message: 'É preciso aceitar os Termos de Uso' })
  acceptTermsOfUse!: boolean;

  @Equals(true, { message: 'É preciso aceitar a Política de Privacidade' })
  acceptPrivacyPolicy!: boolean;

  @Equals(true, { message: 'É preciso aceitar o Termo de Tratamento de Dados' })
  acceptTerms!: boolean;

  @Equals(true, { message: 'O cadastro é para maiores de 18 anos' })
  isAdult!: boolean;
}

/** O que o candidato edita no próprio perfil. E-mail fica de fora. */
export class UpdateCandidateDto {
  @IsOptional()
  @trim()
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @toDigits()
  @IsString()
  @Validate(IsBrazilianPhoneConstraint)
  phone?: string;

  /** String vazia remove o perfil. */
  @IsOptional()
  @trim()
  @IsString()
  @Matches(new RegExp(`${LINKEDIN_URL.source}|^$`, 'i'), {
    message: LINKEDIN_MESSAGE,
  })
  @MaxLength(300)
  linkedinUrl?: string;
}

export class ConsentDto {
  @Equals(true, { message: 'É preciso aceitar o Termo de Tratamento de Dados' })
  acceptTerms!: boolean;
}

/** Pedido de sessão de upload do currículo. */
export class ResumeUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  size!: number;
}
