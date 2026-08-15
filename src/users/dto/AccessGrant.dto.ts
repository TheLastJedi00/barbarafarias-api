import { IsBoolean } from 'class-validator';

/**
 * Concessão manual de acesso (spec 025). Um campo só, de propósito: a data é
 * conta do servidor, não escolha do cliente. Aceitar um `until` do navegador
 * transformaria a régua de 30 dias em sugestão.
 */
export class AccessGrantDto {
  @IsBoolean({ message: 'active deve ser booleano' })
  active!: boolean;
}
