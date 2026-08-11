import { PlanConfig, planConfig } from './subscription.entity';
import type { SubscriptionPlan } from './subscription.entity';

/**
 * Versão do texto aceito.
 *
 * **Sem isto, mudar o texto invalidaria o histórico inteiro**: um aceite
 * gravado em agosto passaria a apontar para uma redação de dezembro que o
 * aluno nunca leu. Cada alteração de conteúdo sobe a versão; a página de
 * contratos monta o texto **pela versão gravada**, não pela atual.
 */
export const TERMS_VERSION = '2026-08-2';

/**
 * O parcelamento **é com juros**, e isso deixou de ser provisório.
 *
 * A constante nasceu esperando a ativação do parcelamento sem acréscimo no
 * painel (T3). Em 11/08/2026 a dona decidiu que não vai acontecer: quem
 * financia é o Mercado Pago, os juros são do comprador, e a tabela de preços
 * passou a ser publicada **já com eles**.
 *
 * Fica aqui, e falsa, porque é ela que impede a frase "sem juros" de voltar ao
 * contrato por descuido — há teste amarrando as duas coisas. Prometer sem juros
 * e cobrar com juros é reclamação garantida, e agora seria mentira permanente,
 * não uma promessa adiantada.
 */
export const SEM_JUROS_CONFIRMADO = false;

/** Uma cláusula do contrato: título curto e o corpo que o aluno lê. */
export interface TermsClause {
  title: string;
  body: string;
}

/**
 * O contrato que o aluno aceita antes de pagar (spec 023 §7.3).
 *
 * Montado do `PLAN_CONFIGS` mais cláusulas fixas — os números **não** são
 * digitados aqui, para não haver duas fontes de verdade sobre quanto custa.
 *
 * ⚠️ **Minuta.** Isto é texto contratual, não copy: a redação vai como rascunho
 * para a dona revisar antes de entrar no ar. O que o código garante é que os
 * valores batem com o catálogo e que a versão fica registrada.
 */
export function buildTerms(plan: SubscriptionPlan): {
  version: string;
  planLabel: string;
  summary: string;
  clauses: TermsClause[];
} {
  const config = planConfig(plan);
  const clauses = config.recurring
    ? recurringClauses(config)
    : installmentClauses(config);

  return {
    version: TERMS_VERSION,
    planLabel: config.label,
    summary: summaryOf(config),
    clauses: [...clauses, ...FIXED_CLAUSES],
  };
}

/**
 * A frase de uma linha que resume o compromisso financeiro.
 *
 * **Os números são os do pagador**, não os que cobramos. O contrato responde
 * "quanto vou pagar"; a base é conta nossa com o provedor e não diz nada a
 * quem assina.
 */
function summaryOf(config: PlanConfig): string {
  return config.recurring
    ? `Plano ${config.label}: ${money(config.payerTotal)} por mês, renovado automaticamente até você cancelar.`
    : `Plano ${config.label}: ${money(config.payerTotal)} no total, em ${config.installments}x de ${money(config.payerInstallment)}.`;
}

/**
 * Semestral e Anual. Duas coisas que o aluno precisa ver escritas:
 *
 * 1. o **preço à vista** ao lado do total parcelado. O parcelamento tem juros,
 *    e comparar os dois é direito de quem compra a prazo — omitir o à vista
 *    esconde exatamente o custo do financiamento;
 * 2. que o **limite do cartão é comprometido pelo total desde já**. É a
 *    diferença entre "12x de R$ 219,80" na tela e o que acontece com o limite
 *    dele no mesmo instante, e é a surpresa mais comum do parcelado.
 */
function installmentClauses(config: PlanConfig): TermsClause[] {
  const juros = round2(config.payerTotal - config.totalAmount);

  return [
    {
      title: 'Compra parcelada, com juros do parcelamento',
      body:
        `O plano custa ${money(config.totalAmount)} à vista. Parcelado em ` +
        `${config.installments} vezes, o total fica ${money(config.payerTotal)} — ` +
        `${config.installments} parcelas de ${money(config.payerInstallment)} na sua fatura, ` +
        `sendo ${money(juros)} de juros do parcelamento, cobrados pelo Mercado Pago. ` +
        `A compra é uma só: o limite do cartão é comprometido pelo valor total desde já.`,
    },
    {
      title: 'Duração do acesso',
      body:
        `O acesso ao conteúdo e às aulas vale por ${config.installments} meses, ` +
        `contados a partir da confirmação do pagamento.`,
    },
  ];
}

/** Mensal. Sem parcela futura: o compromisso é de um ciclo por vez. */
function recurringClauses(config: PlanConfig): TermsClause[] {
  return [
    {
      title: 'Cobrança mensal automática',
      body:
        `${money(config.payerTotal)} são cobrados do seu cartão de crédito a cada mês, ` +
        `automaticamente, enquanto o plano estiver ativo. A primeira cobrança pode levar ` +
        `até uma hora para aparecer. Ao cadastrar o cartão, pode aparecer e desaparecer ` +
        `no extrato uma cobrança de valor mínimo: é a verificação do cartão, e ela é estornada.`,
    },
    {
      title: 'Cancelamento',
      body:
        `Você pode cancelar quando quiser pelo painel. O cancelamento vale para os ciclos ` +
        `seguintes; o mês já pago não é reembolsado.`,
    },
  ];
}

/** O que vale para qualquer plano. */
const FIXED_CLAUSES: TermsClause[] = [
  {
    title: 'Sem reembolso',
    body:
      'Os valores pagos não são reembolsados, integral ou parcialmente, ' +
      'inclusive em caso de desistência ou de não utilização do conteúdo.',
  },
  {
    title: 'Uso pessoal e intransferível',
    body:
      'O acesso é individual. Compartilhar credenciais ou redistribuir o ' +
      'material encerra o plano sem devolução de valores.',
  },
];

/** `1200` → `R$ 1.200,00`. */
function money(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
