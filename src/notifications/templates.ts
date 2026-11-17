import { Lesson } from '../lessons/lesson.entity';
import { RescheduleRequest } from '../reschedules/reschedule.entity';
import { formatSlotHour } from '../common/slot-time';
import type { ApplicationStatus } from '../recruitment/application.model';

export interface EmailContent {
  subject: string;
  html: string;
}

const REASON_LABELS: Record<string, string> = {
  saude: 'Saúde',
  imprevisto: 'Imprevisto',
  pessoal: 'Pessoal',
  outro: 'Outro',
};

const DAYS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

/** 'YYYY-MM-DD' → '03/08/2026 (segunda-feira)'. */
function formatDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year} (${DAYS[dayOfWeek]})`;
}

function formatSlot(date: string, hour: number): string {
  return `${formatDate(date)} às ${formatSlotHour(hour)}`;
}

function layout(title: string, body: string): string {
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
      <h2 style="color:#111827;font-size:18px;margin:0 0 16px">${title}</h2>
      ${body}
      <p style="margin-top:24px;font-size:12px;color:#6b7280">
        Este é um aviso automático do painel da Bárbara Farias.
      </p>
    </div>
  `.trim();
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;line-height:1.5">${text}</p>`;
}

/**
 * Texto digitado por quem não é da escola (spec 028): o nome do candidato
 * chega de um cadastro público e não pode virar HTML no e-mail da gerente.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  received: 'Recebida',
  reviewing: 'Em análise',
  interview: 'Entrevista',
  approved: 'Aprovada',
  rejected: 'Não selecionada',
};

/** ISO → '14/02/2027'. */
function formatIsoDate(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/');
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const templates = {
  rescheduleRequested(request: RescheduleRequest): EmailContent {
    const motivo = REASON_LABELS[request.reasonType] ?? request.reasonType;
    const detalhe = request.reasonText
      ? paragraph(`<strong>Justificativa:</strong> ${request.reasonText}`)
      : '';
    const tipo =
      request.kind === 'no_show'
        ? 'após ausência não avisada'
        : 'com antecedência';

    return {
      subject: `Reagendamento aguardando aprovação — ${request.teacherName ?? 'professora'}`,
      html: layout(
        'Nova solicitação de reagendamento',
        paragraph(
          `<strong>${request.teacherName ?? 'A professora'}</strong> pediu para remarcar a aula de <strong>${request.studentName ?? 'aluno'}</strong> (${tipo}).`,
        ) +
          paragraph(
            `<strong>Nova data proposta:</strong> ${formatSlot(request.proposedDate, request.proposedHour)}`,
          ) +
          paragraph(`<strong>Motivo:</strong> ${motivo}`) +
          detalhe +
          paragraph('Aprove ou recuse no painel da gerente.'),
      ),
    };
  },

  rescheduleDecided(
    request: RescheduleRequest,
    approved: boolean,
  ): EmailContent {
    const nota = request.decisionNote
      ? paragraph(`<strong>Observação:</strong> ${request.decisionNote}`)
      : '';

    return approved
      ? {
          subject: 'Aula remarcada',
          html: layout(
            'Reagendamento aprovado',
            paragraph(
              `A aula foi remarcada para <strong>${formatSlot(request.proposedDate, request.proposedHour)}</strong>.`,
            ) + nota,
          ),
        }
      : {
          subject: 'Reagendamento recusado — a aula segue no horário original',
          html: layout(
            'Reagendamento recusado',
            paragraph(
              'A gerente recusou a remarcação: a aula continua no horário original.',
            ) + nota,
          ),
        };
  },

  lessonMissed(lesson: Lesson, makeup?: Lesson): EmailContent {
    const reposicao = makeup
      ? paragraph(
          `A reposição foi agendada para <strong>${formatSlot(makeup.date, makeup.hour)}</strong>.`,
        )
      : paragraph(
          'Não foi possível agendar a reposição automaticamente — a gerente vai entrar em contato.',
        );

    return {
      subject: 'Você perdeu a aula de hoje',
      html: layout(
        'Aula perdida',
        paragraph(
          `A aula de ${formatSlot(lesson.date, lesson.hour)} foi registrada como perdida.`,
        ) + reposicao,
      ),
    };
  },

  studentCancelled(lesson: Lesson, makeup?: Lesson): EmailContent {
    const reposicao = makeup
      ? paragraph(
          `Reposição agendada para <strong>${formatSlot(makeup.date, makeup.hour)}</strong>.`,
        )
      : '';

    return {
      subject: `Ausência avisada — ${lesson.studentName ?? 'aluno'}`,
      html: layout(
        'Aluno avisou que não poderá comparecer',
        paragraph(
          `<strong>${lesson.studentName ?? 'O aluno'}</strong> avisou que não vai à aula de ${formatSlot(lesson.date, lesson.hour)}.`,
        ) + reposicao,
      ),
    };
  },

  makeupPushed(makeup: Lesson): EmailContent {
    return {
      subject: 'Reposição remarcada para a semana seguinte',
      html: layout(
        'Conflito no horário de reposição',
        paragraph(
          'O horário de reposição combinado já estava ocupado, então a aula foi empurrada.',
        ) +
          paragraph(
            `<strong>Novo horário:</strong> ${formatSlot(makeup.date, makeup.hour)}`,
          ),
      ),
    };
  },

  studentsPendingTeacher(
    teacherName: string,
    studentNames: string[],
  ): EmailContent {
    const lista = studentNames.map((name) => `<li>${name}</li>`).join('');
    return {
      subject: `${studentNames.length} aluno(s) sem professora responsável`,
      html: layout(
        'Alunos aguardando realocação',
        paragraph(
          `A professora <strong>${teacherName}</strong> foi desativada e os alunos abaixo ficaram sem responsável:`,
        ) +
          `<ul style="margin:0 0 12px;padding-left:20px">${lista}</ul>` +
          paragraph('Realoque-os no painel da gerente.'),
      ),
    };
  },

  applicationReceived(jobTitle: string, candidateName: string): EmailContent {
    const vaga = escapeHtml(jobTitle);
    return {
      subject: `Nova candidatura — ${jobTitle}`,
      html: layout(
        'Nova candidatura recebida',
        paragraph(
          `<strong>${escapeHtml(candidateName)}</strong> se candidatou à vaga <strong>${vaga}</strong>.`,
        ) + paragraph('Veja o perfil e o currículo no painel de Recrutamento.'),
      ),
    };
  },

  applicationStatusChanged(
    candidateName: string,
    jobTitle: string,
    status: ApplicationStatus,
  ): EmailContent {
    const etapa = APPLICATION_STATUS_LABELS[status];
    return {
      subject: `Sua candidatura: ${etapa} — ${jobTitle}`,
      html: layout(
        'Sua candidatura foi atualizada',
        paragraph(`Olá, ${escapeHtml(candidateName)}.`) +
          paragraph(
            `Sua candidatura à vaga <strong>${escapeHtml(jobTitle)}</strong> está agora na etapa <strong>${etapa}</strong>.`,
          ) +
          paragraph(
            'Acompanhe pelo seu painel no Trabalhe Conosco. Você pode excluir seus dados a qualquer momento por lá.',
          ),
      ),
    };
  },

  /** Compra paga na loja (spec 032): para o comprador. */
  storePurchaseConfirmed(
    buyerName: string,
    title: string,
    accessUntil: string,
  ): EmailContent {
    return {
      subject: `Compra confirmada — ${title}`,
      html: layout(
        'Sua compra foi confirmada',
        paragraph(`Olá, ${escapeHtml(buyerName)}.`) +
          paragraph(
            `O pagamento de <strong>${escapeHtml(title)}</strong> foi confirmado. Seu acesso vale até <strong>${formatIsoDate(accessUntil)}</strong>.`,
          ) +
          paragraph('Acesse em <strong>Meus módulos</strong>, no painel.') +
          paragraph(
            'Você pode desistir da compra em até 7 dias a partir do pagamento, pelo próprio painel, e recebe o valor de volta.',
          ),
      ),
    };
  },

  /** Venda na loja (spec 032): para as gerentes. */
  storeSale(buyerName: string, title: string, price: number): EmailContent {
    return {
      subject: `Nova venda na loja — ${title}`,
      html: layout(
        'Nova venda na loja',
        paragraph(
          `<strong>${escapeHtml(buyerName)}</strong> comprou <strong>${escapeHtml(title)}</strong> por ${formatMoney(price)}.`,
        ),
      ),
    };
  },

  /** Compra devolvida (spec 032): desistência, reembolso ou estorno. */
  storePurchaseRefunded(
    buyerName: string,
    title: string,
    by: 'buyer' | 'manager' | 'gateway',
  ): EmailContent {
    const motivo =
      by === 'buyer'
        ? 'Recebemos sua desistência.'
        : 'Sua compra foi reembolsada.';
    return {
      subject: `Compra reembolsada — ${title}`,
      html: layout(
        'Compra reembolsada',
        paragraph(`Olá, ${escapeHtml(buyerName)}.`) +
          paragraph(
            `${motivo} O valor de <strong>${escapeHtml(title)}</strong> volta pelo mesmo meio de pagamento, e o acesso ao conteúdo foi encerrado.`,
          ) +
          paragraph(
            'No cartão, o estorno aparece na fatura conforme o prazo do banco emissor.',
          ),
      ),
    };
  },

  /** Desistência do comprador (spec 032): para as gerentes saberem. */
  storeWithdrawal(buyerName: string, title: string): EmailContent {
    return {
      subject: `Desistência na loja — ${title}`,
      html: layout(
        'Desistência de compra',
        paragraph(
          `<strong>${escapeHtml(buyerName)}</strong> desistiu de <strong>${escapeHtml(title)}</strong> dentro do prazo de 7 dias. O estorno foi pedido ao Mercado Pago.`,
        ),
      ),
    };
  },
};
