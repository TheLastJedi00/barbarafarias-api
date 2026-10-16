import {
  IsBoolean,
  IsDefined,
  IsNumber,
  IsOptional,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Concessão manual de acesso (spec 025). A data continua sendo conta do
 * servidor, não escolha do cliente: aceitar um `until` do navegador
 * transformaria a régua de 30 dias em sugestão.
 *
 * Spec 026 §9–§10: a concessão registra **quanto a gerente recebeu**
 * (`amount`, zero = cortesia) e a revogação, se o valor é **estornado**
 * (`refund`). A ordem de implantação foi BE aceita → FE manda → BE exige;
 * esta é a terceira fase (Sprint 9), com o front que manda os dois já no ar.
 *
 * - `amount` é **obrigatório** em `active: true` — regra só de entrada, mora
 *   aqui;
 * - `refund` é obrigatório em `active: false` **só quando há** lançamento com
 *   valor a estornar — isso depende do banco, então quem recusa é o service.
 */
export class AccessGrantDto {
  @IsBoolean({ message: 'active deve ser booleano' })
  active!: boolean;

  /** R$ recebidos por fora do gateway. Obrigatório ao conceder; ignorado ao revogar. */
  @ValidateIf((dto: AccessGrantDto) => dto.active === true)
  @IsDefined({
    message: 'Informe o valor recebido (amount) — zero é cortesia',
  })
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
