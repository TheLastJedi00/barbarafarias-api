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
export const TERMS_VERSION = '2026-08-1';

/**
 * A cláusula "sem juros" **não está no texto**, e a ausência é deliberada.
 *
 * Ela só é verdadeira se a conta do Mercado Pago estiver com parcelamento sem
 * acréscimo ativado — **para 12 parcelas**, não só 6 —, o que é configuração de
 * painel, fora do código e invisível em qualquer diff. Prometer e cobrar
 * diferente é reclamação garantida.
 *
 * Quando a conferência de go-live confirmar, sobe-se a versão e acrescenta-se
 * a frase. Enquanto isso o texto diz o que se sabe ser verdade: que o valor
 * total é este, e que o parcelamento é feito pelo emissor do cartão.
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

/** A frase de uma linha que resume o compromisso financeiro. */
function summaryOf(config: PlanConfig): string {
  return config.recurring
    ? `Plano ${config.label}: ${money(config.totalAmount)} por mês, renovado automaticamente até você cancelar.`
    : `Plano ${config.label}: ${money(config.totalAmount)} no total, em ${config.installments}x de ${money(config.installmentAmount)}.`;
}

/**
 * Semestral e Anual. A cláusula que mais importa é a primeira: o cartão é
 * debitado **pelo total**, de uma vez, e quem divide é o banco do aluno. É a
 * diferença entre o que ele vê na tela ("12x de R$ 190") e o que acontece no
 * limite do cartão dele no mesmo instante.
 */
function installmentClauses(config: PlanConfig): TermsClause[] {
  return [
    {
      title: 'Cobrança única, parcelada pelo seu banco',
      body:
        `O valor total de ${money(config.totalAmount)} é debitado do seu cartão de crédito ` +
        `em uma única cobrança, no ato da contratação. Quem divide esse valor em ` +
        `${config.installments} parcelas de ${money(config.installmentAmount)} é o banco emissor do ` +
        `cartão, na sua fatura. O limite do cartão é comprometido pelo valor total desde já.`,
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
        `${money(config.totalAmount)} são cobrados do seu cartão de crédito a cada mês, ` +
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
