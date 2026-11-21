import { PlanConfig, planConfig, regimeOf } from './subscription.entity';
import type { LegacyPlan, TierPlan } from './subscription.entity';
import {
  FIDELITY_MONTHS,
  PACKAGE_MONTHS,
  type PlanTier,
} from '../plan-tiers/plan-tier.model';
import { PACKAGE_MAX_INSTALLMENTS } from './subscription.entity';

/**
 * Versão do texto aceito.
 *
 * **Sem isto, mudar o texto invalidaria o histórico inteiro**: um aceite
 * gravado em agosto passaria a apontar para uma redação de dezembro que o
 * aluno nunca leu. Cada alteração de conteúdo sobe a versão; a página de
 * contratos monta o texto **pela versão gravada**, não pela atual.
 */
export const TERMS_VERSION = '2026-10-1';

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
export function buildTerms(plan: LegacyPlan): {
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

/**
 * Versão do contrato dos **tiers** (spec 035). Separada da dos planos antigos
 * porque o texto é outro: um aceite antigo continua apontando para a redação
 * dele, e o de tier para esta.
 */
export const TIER_TERMS_VERSION = '2026-11-1';

/**
 * O contrato de um tier, num dos dois jeitos de comprar (spec 035 §4, §5, §9).
 *
 * Os números saem do tier **com o preço vigente** — o mesmo que a contratação
 * congela no `priceSnapshot` —, e as regras são as que o serviço aplica:
 * pacote sem cancelamento, fidelidade de 6 meses, desistência em 7 dias.
 *
 * ⚠️ **Minuta**, como a dos planos antigos: a dona revisa e publica.
 */
export function buildTierTerms(
  tier: PlanTier,
  plan: TierPlan,
): {
  version: string;
  planLabel: string;
  summary: string;
  clauses: TermsClause[];
} {
  const price = plan === 'PACKAGE' ? tier.packagePrice : tier.monthlyPrice;
  if (!price) {
    throw new Error(
      `O plano ${tier.name} não vende ${plan === 'PACKAGE' ? 'pacote' : 'assinatura'}.`,
    );
  }
  const regime = regimeOf({ plan, tierName: tier.name, priceSnapshot: price });

  const inclui: TermsClause = {
    title: 'O que o plano inclui',
    body: `${tier.name}: ${tier.benefits.join('; ')}.`,
  };

  const clauses: TermsClause[] =
    plan === 'PACKAGE'
      ? [
          inclui,
          {
            title: 'Compra de 6 meses, à vista ou parcelada com juros',
            body:
              `O pacote custa ${money(price)} à vista, no PIX ou no cartão. No cartão, ` +
              `pode ser parcelado em até ${PACKAGE_MAX_INSTALLMENTS} vezes, com os juros do ` +
              `parcelamento cobrados pelo Mercado Pago e mostrados antes da confirmação. ` +
              `A compra é uma só: o limite do cartão é comprometido pelo valor total desde já.`,
          },
          {
            title: 'Duração do acesso',
            body:
              `O acesso vale por ${PACKAGE_MONTHS} meses, contados a partir da confirmação do ` +
              `pagamento. O pacote não pode ser cancelado depois do prazo de desistência: ` +
              `o acesso segue até o fim dos ${PACKAGE_MONTHS} meses.`,
          },
        ]
      : [
          inclui,
          {
            title: 'Cobrança mensal automática',
            body:
              `${money(price)} são cobrados do seu cartão de crédito a cada mês, ` +
              `automaticamente. A primeira cobrança pode levar até uma hora para aparecer. ` +
              `Ao cadastrar o cartão, pode aparecer e desaparecer no extrato uma cobrança de ` +
              `valor mínimo: é a verificação do cartão, e ela é estornada.`,
          },
          {
            title: `Fidelidade de ${FIDELITY_MONTHS} meses`,
            body:
              `A assinatura tem fidelidade de ${FIDELITY_MONTHS} meses a partir da contratação: ` +
              `passado o prazo de desistência, ela só pode ser cancelada pelo painel depois ` +
              `desse período. Depois da fidelidade, segue renovando todo mês até ser cancelada, ` +
              `e o mês já pago vale até o fim. Se a assinatura for encerrada por fora do painel ` +
              `durante a fidelidade, é sem multa: o acesso vale até o fim do mês pago e é ` +
              `bloqueado quando a próxima cobrança não acontecer.`,
          },
        ];

  return {
    version: TIER_TERMS_VERSION,
    planLabel: regime.label,
    summary:
      plan === 'PACKAGE'
        ? `${regime.label}: ${money(price)} à vista, ou em até ${PACKAGE_MAX_INSTALLMENTS}x no cartão com juros do parcelamento.`
        : `${regime.label}: ${money(price)} por mês, com fidelidade de ${FIDELITY_MONTHS} meses.`,
    clauses: [...clauses, ...FIXED_CLAUSES],
  };
}

/** O que vale para qualquer plano. */
const FIXED_CLAUSES: TermsClause[] = [
  {
    // Spec 029: era "Sem reembolso… inclusive em caso de desistência", que
    // contrariava o arrependimento do CDC (art. 49), direito irrenunciável.
    title: 'Reembolso',
    body:
      'Pedidos de reembolso são analisados e negociados diretamente com a ' +
      'gestão da escola, pelo e-mail barbsenglishteacher@gmail.com, ' +
      'informando o nome do aluno, o plano e o motivo. Fica ressalvado o ' +
      'direito de desistir da compra feita pela internet em até 7 (sete) ' +
      'dias, com devolução dos valores pagos (art. 49 do Código de Defesa do ' +
      'Consumidor).',
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
