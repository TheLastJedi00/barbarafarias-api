/**
 * Lançamento de dinheiro recebido por fora do gateway (spec 026 §9).
 *
 * A gerente recebe em dinheiro, transferência ou PIX direto e libera 30 dias
 * na ficha do aluno (spec 025). Até a spec 026 isso não deixava rastro de
 * valor: o financeiro só somava parcelas de assinatura, e todo dinheiro
 * recebido à mão era invisível no faturamento.
 *
 * **Um documento por concessão**, e não um campo no usuário: o aluno acumula
 * concessões ao longo do tempo e o financeiro precisa de todas, cada uma no
 * mês em que entrou.
 */
export class ManualPayment {
  id!: string;
  studentId!: string;
  /**
   * Nome do aluno no momento da concessão. Cópia de propósito: a lista
   * "Recebido por fora" do mês mostra o nome, e buscar a ficha de cada aluno
   * para isso seria uma leitura por linha.
   */
  studentName?: string;
  /** R$, duas casas. **Zero é válido** — é a cortesia. */
  amount!: number;
  /** Instante da concessão (ISO). */
  grantedAt!: string;
  /**
   * 'YYYY-MM' no fuso da operação. Regime de caixa (igual ao PIX da spec 024):
   * o valor é receita **deste** mês, integral. Gravado em vez de derivado para
   * o financeiro consultar por igualdade/intervalo de um campo só — sem índice
   * composto, que exigiria publicar `firestore.indexes.json` à mão em cada
   * projeto (ver "Índices do Firestore" no README).
   */
  month!: string;
  /** Até quando a concessão vale ('YYYY-MM-DD') — o mesmo `manualAccessUntil` gravado no aluno. */
  accessUntil!: string;
  /** userId da gerente que registrou. */
  grantedBy!: string;
  /**
   * Estorno (spec 026 §10.1). **Não apaga**: o lançamento sai da receita do mês
   * em que entrou, mas segue na lista para a gerente conferir.
   */
  voidedAt?: string;
  voidedBy?: string;

  constructor(data: Partial<ManualPayment> = {}) {
    Object.assign(this, data);
  }
}

/** Cortesia: concessão registrada com valor zero. */
export function isCourtesy(payment: ManualPayment): boolean {
  return payment.amount === 0;
}

/** Lançamento que conta como receita: não estornado. */
export function isCounted(payment: ManualPayment): boolean {
  return !payment.voidedAt;
}
