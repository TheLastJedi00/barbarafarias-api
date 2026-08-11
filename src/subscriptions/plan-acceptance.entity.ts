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
