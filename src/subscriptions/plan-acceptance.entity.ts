import type { SubscriptionPlan } from './subscription.entity';

/**
 * O registro de que um aluno concordou com o contrato, num instante (§7.2).
 *
 * **Nunca sobrescrito.** Um documento por aceite: se o aluno cancelar e
 * contratar de novo, são dois registros, e cada um aponta para o texto que
 * valia na sua data. O que dá à dona como responder *"o aluno concordou com
 * isso, neste instante"* é justamente a imutabilidade.
 *
 * Os números são **congelados** aqui, e não lidos do catálogo na hora de
 * exibir: o preço muda, o contrato assinado não muda junto.
 *
 * **Sem IP e sem user-agent**, de propósito: seria dado pessoal novo, sem base
 * declarada, para um ganho probatório que o par `studentId` autenticado +
 * `acceptedAt` já entrega.
 */
export class PlanAcceptance {
  id!: string;
  studentId!: string;
  /** Nome e e-mail copiados para a dona ler sem cruzar coleção. */
  studentName!: string;
  studentEmail!: string;

  plan!: SubscriptionPlan;
  planLabel!: string;
  /** Os números **daquele** momento. */
  totalAmount!: number;
  installments!: number;
  installmentAmount!: number;

  /** Qual redação foi aceita. Ver `TERMS_VERSION`. */
  termsVersion!: string;
  /**
   * ISO **com hora**, no fuso do app. `todayInAppTimezone` cobre só a data, e
   * "concordou em 10/08" não responde a mesma pergunta que "concordou às
   * 22h47 de 10/08".
   */
  acceptedAt!: string;
  /** Fazia parte do que foi acordado. */
  couponCode?: string;

  constructor(data: Partial<PlanAcceptance> = {}) {
    Object.assign(this, data);
  }
}

/**
 * O aceite virou compra? (spec 023 P3)
 *
 * O aceite é gravado **antes** da cobrança, de propósito — a janela alternativa,
 * aluna debitada sem registro de que concordou, é a pior das duas. A
 * consequência é que uma cobrança recusada deixa um aceite na lista mesmo
 * assim, e a gerente lia aquilo como "quem comprou".
 *
 * A decisão foi fazer a tela **ser** isso, em vez de avisar que não é. Este
 * campo é a diferença, e ele não mora no aceite: é calculado na leitura, contra
 * a assinatura de hoje. Gravá-lo exigiria alterar um registro probatório
 * depois de criado, que é exatamente o que ele não pode sofrer.
 */
export const PURCHASE_OUTCOMES = {
  /** Chegou a pagar ao menos uma parcela. */
  PAID: 'PAID',
  /** Concordou e a cobrança não passou. */
  UNPAID: 'UNPAID',
  /**
   * Houve contratação posterior. Não dá para responder por **este** aceite: a
   * aluna tem uma assinatura só, e ela foi reescrita desde então.
   */
  SUPERSEDED: 'SUPERSEDED',
} as const;

export type PurchaseOutcome =
  (typeof PURCHASE_OUTCOMES)[keyof typeof PURCHASE_OUTCOMES];

/** O aceite como a gerente o lê: o registro mais o desfecho da cobrança. */
export interface PlanAcceptanceView extends PlanAcceptance {
  purchase: PurchaseOutcome;
}
