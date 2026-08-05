import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * A senha atual é parte do contrato, não conveniência (spec 016 decisão 9):
 * trocar o e-mail muda quem a pessoa é para o sistema, e sem re-autenticação
 * uma aba esquecida aberta bastaria para sequestrar a conta.
 */
export class ChangeEmailDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  novoEmail!: string;

  @IsString()
  @MinLength(6, { message: 'Informe sua senha atual.' })
  senhaAtual!: string;
}
