import type { PlanTier } from '../plan-tiers/plan-tier.model';
import { FIDELITY_MONTHS, PACKAGE_MONTHS } from '../plan-tiers/plan-tier.model';
import type { TierPlan } from '../subscriptions/subscription.entity';
import type { TermsClause } from '../subscriptions/plan-terms';
import type { Turma } from '../turmas/turma.entity';
import { formatSlotHour } from '../common/slot-time';
import { ENROLLMENT_WITHDRAWAL_DAYS } from './enrollment.model';

/**
 * Versão do termo de matrícula. **Rascunho para a dona revisar** antes de ir
 * ao ar; mudar o texto exige subir a versão, como no termo dos planos.
 */
export const ENROLLMENT_TERMS_VERSION = '2026-11-1';

const DAYS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

const brl = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const br = (date: string) => date.split('-').reverse().join('/');

export interface EnrollmentTerms {
  version: string;
  planLabel: string;
  summary: string;
  clauses: TermsClause[];
}

/**
 * O termo de matrícula (spec 036 §6), montado da turma e do tier com os
 * números do momento. O sinal é congelado na matrícula; o preço do plano é o
 * do dia da confirmação — e o termo diz isso com essas palavras.
 */
export function buildEnrollmentTerms(
  turma: Turma,
  tier: PlanTier,
  mode: TierPlan,
): EnrollmentTerms {
  const fee = tier.enrollmentFee;
  if (typeof fee !== 'number' || fee <= 0) {
    throw new Error(`O plano ${tier.name} não está com matrícula aberta.`);
  }
  const quando = `${DAYS[turma.dayOfWeek ?? 0]}, às ${formatSlotHour(turma.hour ?? 0)}`;
  const calendario =
    turma.tierId === 'monthly-group'
      ? `nas semanas ${(turma.weeksOfMonth ?? []).join(' e ')} de cada mês, ${quando}`
      : `toda ${quando}`;
  const plano =
    mode === 'PACKAGE'
      ? `pacote de ${PACKAGE_MONTHS} meses`
      : `assinatura mensal com fidelidade de ${FIDELITY_MONTHS} meses`;
  const abatimento =
    mode === 'PACKAGE' ? 'do valor do pacote' : 'da primeira mensalidade';

  return {
    version: ENROLLMENT_TERMS_VERSION,
    planLabel: `${tier.name} — ${turma.name}`,
    summary:
      `Você reserva uma vaga na turma ${turma.name}, com início previsto em ${br(turma.startDate!)}, ` +
      `pagando um sinal de ${brl(fee)} que será abatido ${abatimento} quando a turma for confirmada.`,
    clauses: [
      {
        title: '1. Objeto',
        body:
          `Reserva de vaga na turma ${turma.name} do plano ${tier.name}, com encontros ${calendario}` +
          `${turma.teacherName ? `, conduzidos pela professora ${turma.teacherName}` : ''}, ` +
          `e início previsto em ${br(turma.startDate!)}.`,
      },
      {
        title: '2. Sinal',
        body:
          `O sinal de ${brl(fee)} é pago à vista, no PIX ou no cartão de crédito, e reserva a sua vaga. ` +
          `Ele não é uma taxa extra: quando a turma for confirmada, o sinal é abatido ${abatimento}.`,
      },
      {
        title: '3. Formação da turma',
        body:
          `A turma começa com um mínimo de ${turma.minStudents} alunos com o sinal pago e recebe no ` +
          `máximo ${turma.maxStudents}. Quem confirma a turma é a escola, que avisa você por e-mail.`,
      },
      {
        title: '4. Plano escolhido',
        body:
          `Você escolheu pagar o plano como ${plano}. Com a turma confirmada, o plano é cobrado pelo ` +
          `preço vigente no dia da confirmação, com o sinal e o cupom (se houver) já descontados, e deve ` +
          `ser pago até a data de início. Os ${mode === 'PACKAGE' ? `${PACKAGE_MONTHS} meses do pacote` : `${FIDELITY_MONTHS} meses de fidelidade`} ` +
          'contam a partir da data de início da turma, não da matrícula.',
      },
      {
        title: '5. Se a turma não fechar',
        body:
          'Se o mínimo não for atingido até a data de início, a escola pode adiar o início para outra ' +
          'data no mesmo dia e horário — e nesse caso você pode pedir o sinal de volta até a nova data — ' +
          'ou cancelar a turma, e então o sinal é devolvido integralmente, sem você precisar pedir.',
      },
      {
        title: '6. Desistência',
        body:
          `Você pode desistir da matrícula em até ${ENROLLMENT_WITHDRAWAL_DAYS} dias do pagamento do sinal, ` +
          'com devolução integral (art. 49 do Código de Defesa do Consumidor). Depois desse prazo o sinal ' +
          'não é devolvido, a não ser que a turma seja adiada ou cancelada.',
      },
      {
        title: '7. Acesso à plataforma',
        body:
          'As aulas, as vídeo aulas e os materiais ficam disponíveis a partir da data de início da turma, ' +
          'com o plano pago. Até lá, você acompanha a formação da turma em Meu Plano.',
      },
      {
        title: '8. Plano não pago até o início',
        body:
          'Se o plano não for pago até a data de início, a vaga continua sua, mas o acesso não é liberado ' +
          'até o pagamento. Passado o prazo de desistência, o sinal não é devolvido por esse motivo.',
      },
    ],
  };
}
