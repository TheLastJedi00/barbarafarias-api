/**
 * O vocabulário de status do Mercado Pago (spec 023 §4.6).
 *
 * **É a correção mais perigosa desta migração**, e o motivo é que os dois
 * produtos usados aqui — Orders (PIX e cartão parcelado) e Assinaturas (plano
 * mensal) — usam a **mesma palavra com sentidos opostos**:
 *
 * | produto | valor | o que significa de verdade |
 * |---|---|---|
 * | Orders | `processed` + `accredited` | **pago.** É este o par que ativa |
 * | Orders | `action_required` + `waiting_transfer` | PIX emitido, aguardando o aluno |
 * | Orders | `action_required` + `pending_challenge` | 3DS pediu verificação |
 * | Assinaturas | `processed` | terminou de processar — pago **ou** recusado |
 * | Assinaturas | `recycling` | recusado, ainda em retentativa |
 * | Assinaturas | `waiting for gateway` | em processamento |
 *
 * A linha das Assinaturas é a armadilha. A doc: *"Caso a parcela não possa ser
 * cobrada na quarta tentativa, ela estará automaticamente no status `processed`
 * associada a um pagamento recusado."* Em Orders, `processed` é sucesso. Em
 * Assinaturas, `processed` significa só que a máquina parou de tentar — e o
 * desfecho mais provável de um `processed` tardio é justamente a recusa, porque
 * foi ela que esgotou as tentativas.
 *
 * Um handler que trate `processed` de forma uniforme dá **acesso vitalício de
 * graça para quem nunca pagou**, responde 200, não loga nada e não aparece em
 * teste nenhum que não tenha sido escrito de propósito.
 *
 * Daí as três regras que este módulo existe para impor:
 *
 * 1. **Ativar exige o par completo**, nunca `status` sozinho.
 * 2. **Em assinatura, `processed` não é sinal de pagamento** — olha-se o
 *    pagamento associado.
 * 3. **Nenhum caminho-padrão ativa nada.** Status desconhecido é log, não
 *    permissão: as funções abaixo respondem por **lista fechada** e devolvem
 *    `false` para tudo o que não reconhecem.
 *
 * E uma palavra que **não** aparece em lugar nenhum: `approved`. Ela é o
 * vocabulário da API de Pagamentos, o caminho legado. Um
 * `if (status === 'approved')` sobre uma order nunca é verdadeiro — ninguém
 * recebe acesso, e nenhum erro é lançado.
 */

/** `status` de uma order. Lista fechada, tirada da tabela oficial. */
export const ORDER_STATUS = {
  CREATED: 'created',
  PROCESSING: 'processing',
  PROCESSED: 'processed',
  ACTION_REQUIRED: 'action_required',
  CANCELED: 'canceled',
  CHARGED_BACK: 'charged_back',
  EXPIRED: 'expired',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  IN_REVIEW: 'in_review',
} as const;

/** `status_detail` de uma order ou transação, nos casos que decidem algo. */
export const ORDER_STATUS_DETAIL = {
  /** **O único detalhe que credita dinheiro.** */
  ACCREDITED: 'accredited',
  /** PIX emitido: o QR existe e o aluno ainda não pagou. */
  WAITING_TRANSFER: 'waiting_transfer',
  WAITING_PAYMENT: 'waiting_payment',
  /** 3DS: o aluno tem ~40 minutos para completar o desafio (§9.6). */
  PENDING_CHALLENGE: 'pending_challenge',
  /** Criação assíncrona: a order existe, o pagamento ainda não (§4.3). */
  IN_PROCESS: 'in_process',
} as const;

/** Estado de uma cobrança já traduzido para o nosso domínio. */
export const CHARGE_OUTCOMES = {
  /** Dinheiro creditado. **É o único que ativa plano.** */
  PAID: 'PAID',
  /** Emitida e no ar; quem conclui é o aluno (PIX) ou o gateway. */
  PENDING: 'PENDING',
  /** 3DS: falta o aluno completar o desafio. Não é sucesso (§9.6). */
  CHALLENGE: 'CHALLENGE',
  /** Recusada de vez. */
  REJECTED: 'REJECTED',
} as const;

export type ChargeOutcome =
  (typeof CHARGE_OUTCOMES)[keyof typeof CHARGE_OUTCOMES];

/** O par `status`/`status_detail` de uma order, como a API os devolve. */
export interface OrderStatusPair {
  status?: string;
  status_detail?: string;
}

/**
 * **Pago?** Exige o par completo.
 *
 * `processed` sozinho não basta: `processed` + `partially_refunded` também é
 * `processed`, e um dia haverá um terceiro detalhe. A regra é ativar por lista
 * fechada e logar o resto.
 */
export function isOrderPaid(pair: OrderStatusPair): boolean {
  return (
    pair.status === ORDER_STATUS.PROCESSED &&
    pair.status_detail === ORDER_STATUS_DETAIL.ACCREDITED
  );
}

/**
 * O desafio 3DS está aberto. **Não é sucesso**: ligar o 3DS sem tratar este
 * ramo deixa o aluno debitado, a tela dizendo "concluído" e a cobrança nunca
 * completando (§9.6, falha silenciosa 19).
 */
export function isOrderChallengePending(pair: OrderStatusPair): boolean {
  return (
    pair.status === ORDER_STATUS.ACTION_REQUIRED &&
    pair.status_detail === ORDER_STATUS_DETAIL.PENDING_CHALLENGE
  );
}

/**
 * A cobrança está no ar e o desfecho ainda não veio — PIX aguardando o aluno,
 * captura pendente, criação assíncrona. **Não ativa nada**, mas também não é
 * recusa: quem conclui é o webhook.
 */
export function isOrderPending(pair: OrderStatusPair): boolean {
  if (pair.status === ORDER_STATUS.PROCESSING) return true;
  if (pair.status !== ORDER_STATUS.ACTION_REQUIRED) return false;
  return (
    pair.status_detail === ORDER_STATUS_DETAIL.WAITING_TRANSFER ||
    pair.status_detail === ORDER_STATUS_DETAIL.WAITING_PAYMENT
  );
}

/**
 * Traduz o par da order para o nosso domínio.
 *
 * A ordem das perguntas é deliberada e o **último ramo é `REJECTED`**, não
 * "deu certo": qualquer status que este módulo não reconheça — inclusive um
 * que o Mercado Pago crie amanhã — cai em recusa, que é o desfecho seguro.
 * O caminho oposto libera acesso sem dinheiro.
 */
export function outcomeOfOrder(pair: OrderStatusPair): ChargeOutcome {
  if (isOrderPaid(pair)) return CHARGE_OUTCOMES.PAID;
  if (isOrderChallengePending(pair)) return CHARGE_OUTCOMES.CHALLENGE;
  if (isOrderPending(pair)) return CHARGE_OUTCOMES.PENDING;
  return CHARGE_OUTCOMES.REJECTED;
}

/** `status` de uma parcela de assinatura. */
export const SUBSCRIPTION_CYCLE_STATUS = {
  /** **Não significa pago.** Significa que parou de tentar. */
  PROCESSED: 'processed',
  /** Recusado, ainda dentro das 4 tentativas. */
  RECYCLING: 'recycling',
  SCHEDULED: 'scheduled',
  WAITING_GATEWAY: 'waiting for gateway',
} as const;

/** Uma parcela de assinatura como `/authorized_payments/{id}` a devolve. */
export interface SubscriptionCycle {
  id?: string | number;
  preapproval_id?: string;
  status?: string;
  payment?: { id?: string | number; status?: string; status_detail?: string };
}

/**
 * **A parcela do mensal foi paga?**
 *
 * Repare no que **não** está sendo perguntado: o `status` da parcela. Ele vale
 * `processed` tanto para quem pagou quanto para quem teve o cartão recusado
 * quatro vezes, e é exatamente essa ambiguidade que dá acesso vitalício de
 * graça se alguém tratar os dois juntos.
 *
 * Quem decide é o **pagamento associado**, e por `status_detail`: `accredited`
 * é o mesmo token que a Orders API usa para "dinheiro creditado", o que deixa
 * as duas metades desta integração com **uma** lista fechada em vez de duas.
 * É também o que evita trazer para cá o `approved` da API de Pagamentos — a
 * palavra que, aplicada a uma order, nunca é verdadeira (§4.6).
 *
 * Parcela sem pagamento associado é `false`: ausência não é aprovação.
 */
export function isSubscriptionCyclePaid(cycle: SubscriptionCycle): boolean {
  return cycle.payment?.status_detail === ORDER_STATUS_DETAIL.ACCREDITED;
}

/** `status` de uma assinatura (`/preapproval`). */
export const PREAPPROVAL_STATUS = {
  /** Sem meio de pagamento: exigiria o link do Mercado Pago (§4.2). */
  PENDING: 'pending',
  AUTHORIZED: 'authorized',
  PAUSED: 'paused',
  CANCELLED: 'cancelled',
} as const;

/**
 * A assinatura acabou lá fora.
 *
 * Chega sem ninguém pedir: depois de **3 parcelas recusadas** o Mercado Pago
 * cancela sozinho e avisa a conta da vendedora por e-mail (§9.7). A régua é
 * dele, não nossa — por isso escutamos o cancelamento em vez de deduzi-lo.
 */
export function isPreapprovalDead(status?: string): boolean {
  return status === PREAPPROVAL_STATUS.CANCELLED;
}
