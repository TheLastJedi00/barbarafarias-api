/**
 * Cupom de desconto criado pela gerente (spec 012 RF15).
 *
 * É um cupom **nosso**, não o do AbacatePay: o desconto precisa ser em reais e
 * durar um número de parcelas da assinatura, e o cupom do gateway modela outra
 * coisa (percentual/fixo com limite de resgates, sem noção de duração). Manter
 * o cálculo aqui também deixa o valor da parcela correto antes de a cobrança
 * sequer existir, que é o que a tela do aluno mostra (RF16).
 */
export class Coupon {
  id!: string;
  /** Sempre em maiúsculas; é a chave de busca e não se repete. */
  code!: string;
  /** Abatimento em R$ por parcela. Nunca deixa a parcela ficar negativa. */
  discountAmount!: number;
  /** Por quantas parcelas vale. `null` = vitalício. */
  durationMonths!: number | null;
  active!: boolean;
  createdAt!: string;
  createdBy!: string;

  constructor(data: Partial<Coupon> = {}) {
    Object.assign(this, data);
  }
}

/** Normaliza o que o aluno digitou para a forma canônica do código. */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Aplica o desconto sem deixar a parcela negativa (RF15). O piso é zero: uma
 * parcela de R$ 0 é legítima (cupom cobre o mês inteiro), devolver dinheiro não.
 */
export function applyDiscount(amount: number, discount: number): number {
  return Math.max(0, round2(amount - discount));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
