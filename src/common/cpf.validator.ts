import { ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';

/** Tira máscara, espaço e qualquer coisa que não seja dígito. */
export function onlyDigits(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

/**
 * CPF válido segundo os dois dígitos verificadores.
 *
 * Contar 11 dígitos não basta: o gateway valida o número de verdade e recusa
 * a cobrança de um CPF inventado — o erro apareceria só no checkout, longe do
 * formulário que o originou (spec 013 Task 45.2).
 */
export function isValidCpf(value: unknown): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return false;
  // Sequências repetidas (111.111.111-11) passam na conta dos dígitos.
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += Number(digits[i]) * (length + 1 - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

/** Celular ou fixo brasileiro: DDD + 8 ou 9 dígitos. */
export function isValidBrazilianPhone(value: unknown): boolean {
  const digits = onlyDigits(value);
  return digits.length === 10 || digits.length === 11;
}

@ValidatorConstraint({ name: 'isCpf', async: false })
export class IsCpfConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidCpf(value);
  }

  defaultMessage(): string {
    return 'CPF inválido';
  }
}

@ValidatorConstraint({ name: 'isBrazilianPhone', async: false })
export class IsBrazilianPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidBrazilianPhone(value);
  }

  defaultMessage(): string {
    return 'Telefone deve ter DDD e 8 ou 9 dígitos';
  }
}
