/**
 * Contrato (spec 036 §6): o que o aluno aceitou **antes de pagar**, congelado
 * no instante do aceite.
 *
 * **O texto é copiado, não remontado.** Os termos do plano e da matrícula são
 * montados pelo código a partir do catálogo; remontar depois devolveria o
 * texto de hoje, não o que o aluno leu. O PDF sai sempre desta cópia.
 *
 * **Imutável.** Nenhum caminho do código atualiza um contrato: o repositório
 * só cria, e criar de novo o mesmo (mesmo `kind` + `refId`) devolve o original.
 */
export const CONTRACT_KINDS = {
  /** Matrícula de turma em formação (spec 036). */
  ENROLLMENT: 'ENROLLMENT',
  /** Plano: tier da 035 ou os planos antigos. */
  PLAN: 'PLAN',
  /** Compra da loja de módulos (spec 032). */
  STORE: 'STORE',
} as const;

export type ContractKind = (typeof CONTRACT_KINDS)[keyof typeof CONTRACT_KINDS];

export interface ContractClause {
  title: string;
  body: string;
}

/** Uma linha do quadro "o que foi contratado" (turma, valor, parcelas…). */
export interface ContractDealLine {
  label: string;
  value: string;
}

export class Contract {
  id!: string;
  studentId!: string;
  /** Nome e e-mail **daquele** momento: são as partes do contrato. */
  studentName!: string;
  studentEmail!: string;
  kind!: ContractKind;
  /** Matrícula, aceite do plano ou compra da loja que gerou o contrato. */
  refId!: string;
  title!: string;
  termsVersion!: string;
  summary!: string;
  clauses!: ContractClause[];
  deal!: ContractDealLine[];
  /** ISO com hora, do aceite. */
  acceptedAt!: string;
  createdAt?: string;

  constructor(data: Partial<Contract> = {}) {
    Object.assign(this, data);
    if (!this.id && this.kind && this.refId) {
      this.id = contractIdOf(this.kind, this.refId);
    }
  }
}

/**
 * Id determinístico: um contrato por aceite. É o que deixa o backfill
 * idempotente e impede dois contratos para a mesma compra.
 */
export function contractIdOf(kind: ContractKind, refId: string): string {
  return `${kind}_${refId}`;
}
