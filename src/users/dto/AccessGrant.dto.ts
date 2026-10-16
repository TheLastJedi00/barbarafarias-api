import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Concessão manual de acesso (spec 025). A data continua sendo conta do
 * servidor, não escolha do cliente: aceitar um `until` do navegador
 * transformaria a régua de 30 dias em sugestão.
 *
 * Spec 026 §9–§10: a concessão passa a registrar **quanto a gerente recebeu**
 * (`amount`, zero = cortesia) e a revogação, se o valor é **estornado**
 * (`refund`). Os dois nascem **opcionais**: com `forbidNonWhitelisted`, o front
 * não pode mandá-los antes de o back aceitá-los, e o back não pode exigi-los
 * antes de o front já mandá-los. A ordem é BE aceita → FE manda → BE exige.
 */
export class AccessGrantDto {
  @IsBoolean({ message: 'active deve ser booleano' })
  active!: boolean;

  /** R$ recebidos por fora do gateway. Só lido quando `active: true`. */
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'amount deve ser um valor em reais com até 2 casas' },
  )
  @Min(0, { message: 'amount não pode ser negativo' })
  amount?: number;

  /** Estornar o último lançamento ao revogar. Só lido quando `active: false`. */
  @IsOptional()
  @IsBoolean({ message: 'refund deve ser booleano' })
  refund?: boolean;
}
