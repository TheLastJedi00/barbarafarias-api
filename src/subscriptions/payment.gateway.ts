/**
 * Quem vai pagar. CPF e celular são exigidos antes de chegar aqui
 * (`assertPayableProfile`, spec 013 Task 45.3): barrar depois de gravar a
 * assinatura deixaria um plano pendente sem cobrança emitida.
 */
export interface GatewayCustomer {
  name?: string;
  email: string;
  cellphone?: string;
  taxId?: string;
}

/** Identifica o plano por trás da cobrança, para o painel do gateway. */
export interface ChargeProduct {
  /** Chave estável do plano (`MONTHLY`, `ANNUAL`, …). */
  key: string;
  /** Rótulo legível. */
  label: string;
}

export interface ChargeRequest {
  /** Valor em **reais**. A conversão de unidade é feita na fronteira. */
  amount: number;
  description: string;
  /** Id da cobrança no nosso lado, para reconciliar depois. */
  externalId: string;
  customer: GatewayCustomer;
  product?: ChargeProduct;
}

/**
 * Quem processou uma cobrança. Guardado na parcela para o webhook se achar.
 *
 * **Tem um valor só, e continua existindo** (spec 023 Task 26). O que saiu na
 * migração foram as *implementações*, não a abstração: um campo com um valor
 * só é barato, e é o que torna a próxima troca de adquirente igual a esta.
 *
 * Os provedores antigos não aparecem mais aqui, mas **as parcelas antigas
 * continuam gravadas com eles** no Firestore, e o painel financeiro as soma
 * normalmente. Apagar gateway é código; apagar histórico seria receita.
 */
export const GATEWAY_PROVIDERS = {
  MERCADOPAGO: 'MERCADOPAGO',
} as const;

export type GatewayProvider =
  (typeof GATEWAY_PROVIDERS)[keyof typeof GATEWAY_PROVIDERS];

/**
 * Cartão tokenizado **no navegador**. O que trafega é um token de uso único e
 * validade de 7 dias; PAN e CVC nunca passam pelo backend, que é a garantia
 * que a spec 014 estabeleceu e esta migração preserva.
 */
export interface CardTokenRef {
  token: string;
  /** Bandeira resolvida pelo formulário do gateway (`master`, `visa`, …). */
  paymentMethodId: string;
}

/**
 * Pedido de checkout de cartão. Estende o pedido de cobrança com o que só o
 * cartão tem: as parcelas, a recorrência e o cartão tokenizado.
 */
export interface CheckoutRequest extends ChargeRequest {
  /** Plano do aluno, para o gateway resolver o produto/preço do catálogo. */
  plan: string;
  /** Rótulo legível do plano, usado para nomear o produto no painel. */
  planLabel?: string;
  /** Dono da assinatura. É por ele que o gateway acha (ou grava) o pagador. */
  studentId: string;
  /** Parcela sendo cobrada, para o webhook saber qual confirmar. */
  chargeIndex?: number;
  /**
   * Quantos ciclos mensais a assinatura tem. `null` = sem fim (plano mensal);
   * `6`/`12` fecham o semestral e o anual no fim do período.

   * É esta a régua que decide **qual produto do gateway é usado**: `null` abre
   * uma assinatura recorrente; um número vira uma cobrança só, parcelada.
   */
  recurring?: { cycles: number | null };
  /**
   * Em quantas vezes o cartão é dividido pelo emissor.

   * **Sai do `PLAN_CONFIGS`, nunca do que o cliente mandou.** A trava do
   * formulário é conveniência; sem esta régua no backend, um aluno decidido
   * paga em 1x um plano vendido em 12x e nada acusa (falha silenciosa 18).

   */
  installments: number;
  /** Cartão tokenizado no navegador. */
  card: CardTokenRef;
  /**
   * Código do cupom, **só para constar no painel do gateway**: o desconto já
   * está abatido no `amount`.

   * Foi assim que a decisão virou: o motivo de mandar o cupom inteiro era o
   * gateway aplicá-lo às renovações. Num pagamento único não há renovação, e
   * um objeto de desconto no meio do caminho só cria uma segunda fonte de
   * verdade sobre quanto o aluno deve.
   */
  couponCode?: string;
}

/**
 * Desfecho de uma cobrança, já traduzido do vocabulário do provedor.
 *
 * Existe no nível da **porta**, e não dentro de um gateway, porque é o que a
 * regra de negócio precisa saber: se libera acesso, se espera, se manda o
 * aluno completar alguma coisa, ou se recusou. O mapeamento de cada provedor
 * para estes quatro valores é problema da implementação.
 */
export const CHARGE_OUTCOMES = {
  /** Dinheiro creditado. **É o único que ativa plano.** */
  PAID: 'PAID',
  /** No ar, aguardando desfecho. Quem conclui é o webhook. */
  PENDING: 'PENDING',
  /** Falta o aluno completar uma verificação (3DS). **Não é sucesso.** */
  CHALLENGE: 'CHALLENGE',
  REJECTED: 'REJECTED',
} as const;

export type ChargeOutcome =
  (typeof CHARGE_OUTCOMES)[keyof typeof CHARGE_OUTCOMES];

export interface PixChargeResult {
  id: string;
  /** Código copia-e-cola. */
  brCode: string;
  /** QR Code em base64 (data URI pronta para `<img src>`). */
  brCodeBase64: string;
}

/**
 * O resultado de uma cobrança de cartão.
 *
 * Não há mais `url` nem `clientSecret`: com a tokenização no navegador o
 * pagamento é **enviado** pelo backend, não delegado a uma página do
 * provedor. O que volta é um desfecho, e o `challengeUrl` quando o 3DS pede
 * uma verificação a mais.
 */
export interface CheckoutResult {
  id: string;
  provider: GatewayProvider;
  outcome: ChargeOutcome;
  /** Para onde mandar o aluno quando `outcome === 'CHALLENGE'`. */
  challengeUrl?: string;
  /** Id da assinatura no gateway, quando a cobrança cria uma. */
  subscriptionId?: string;
  /** Motivo legível da recusa, para a tela dizer algo além de "falhou". */
  detail?: string;
}

/**
 * Raiz das portas de cobrança. Existe pelo mesmo motivo do `PayoutProvider` do
 * fechamento das professoras: a regra de negócio (cronograma, cupom, status)
 * não deve saber qual gateway está do outro lado, e os testes não devem
 * precisar de rede.
 */
export abstract class PaymentGateway {
  /** `false` quando não há chave configurada — o plano nasce sem cobrança. */
  abstract isEnabled(): boolean;
}

/**
 * Cobrança por PIX.
 *
 * **A justificativa original desta separação caducou** (spec 023 §8). Ela
 * dizia que nenhum provedor implementava os dois de verdade — e o Mercado
 * Pago implementa: a mesma classe atende esta porta e a de cartão.
 *
 * A separação fica, com um motivo melhor do que o que ela tinha: depois desta
 * migração, PIX e cartão não são dois **provedores** do mesmo serviço, são
 * dois **produtos**.
 *
 * | | cartão | PIX |
 * |---|---|---|
 * | natureza | assinatura: cobra até mandarem parar | compra à vista |
 * | quem cobra | o gateway, sozinho | ninguém: o aluno paga quando quiser |
 * | não pagar | 4 tentativas e cancelamento pelo provedor | a cobrança expira |
 *
 * Ciclo de vida diferente, tela diferente, e no fim das contas regime
 * contábil diferente. A porta separada deixou de ser contorno de limitação de
 * fornecedor e passou a desenhar uma fronteira que existe no domínio — que é a
 * única razão duradoura para uma abstração existir.
 */
export abstract class PixGateway extends PaymentGateway {
  abstract createPixCharge(request: ChargeRequest): Promise<PixChargeResult>;
  /** Simula a confirmação do PIX no ambiente de testes do gateway. */
  abstract simulatePayment(chargeId: string): Promise<boolean>;
}

/**
 * Cobrança no cartão: parcelada nos planos fechados, recorrente no mensal.
 * A porta irmã do PIX — ver `PixGateway` para por que continuam separadas.
 */
export abstract class CardGateway extends PaymentGateway {
  abstract createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  /**
   * Encerra a assinatura no gateway. Tolerante a já estar encerrada: o
   * cancelamento pela tela e o webhook do próprio gateway podem chegar em
   * qualquer ordem.
   */
  abstract cancelSubscription(subscriptionId: string): Promise<void>;
  /**
   * Ajusta o valor cobrado a cada ciclo da assinatura recorrente.

   * Existe por causa do **cupom com prazo**. A assinatura lá fora tem um valor
   * só; um cupom de três meses num plano mensal viraria desconto vitalício se
   * ninguém corrigisse o valor quando ele acaba — receita perdida sem erro
   * nenhum, que é a categoria de falha que esta spec inteira persegue.

   * Quem dita o valor certo continua sendo o nosso cronograma: a parcela em
   * aberto já nasce com (ou sem) o abatimento.
   */
  abstract updateSubscriptionAmount(
    subscriptionId: string,
    amount: number,
  ): Promise<void>;
  /**
   * Relê uma cobrança já criada e devolve o desfecho **atual**.
   *
   * Existe por causa do desafio 3DS. Quando ele termina, a tela sabe apenas que
   * a etapa acabou — **não** se o pagamento passou. Sem esta releitura o único
   * caminho até a resposta é o webhook, e enquanto ele não chega o aluno encara
   * "confirmando" com o dinheiro já debitado.
   *
   * É também o que a doc do provedor recomenda: consultar a order ao fim do
   * desafio, em vez de esperar a notificação.
   */
  abstract fetchChargeOutcome(chargeId: string): Promise<CheckoutResult>;
}

/** R$ → centavos, usado nas chaves de reconciliação. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Uma hora para pagar o PIX antes de o QR Code expirar. */
export const PIX_EXPIRATION_SECONDS = 3600;
