import { IsEmail } from 'class-validator';

/**
 * Convite de aluno (spec 018 Task 101). Um campo só, de propósito: o resto do
 * cadastro é o próprio aluno quem preenche, no onboarding.
 */
export class InviteUserDto {
  @IsEmail(undefined, { message: 'E-mail inválido.' })
  email!: string;
}
