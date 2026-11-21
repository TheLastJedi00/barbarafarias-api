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

  // ------------------------------------------------ turmas (spec 036)

  /** Sinal pago: a vaga é do aluno até a turma fechar. */
  enrollmentPaid(
    studentName: string,
    turmaName: string,
    startDate: string,
    missing: number,
  ): EmailContent {
    const faltam =
      missing > 0
        ? `Faltam <strong>${missing}</strong> ${missing === 1 ? 'aluno' : 'alunos'} para a turma fechar.`
        : 'A turma já tem o mínimo de alunos e aguarda a confirmação da escola.';
    return {
      subject: `Vaga reservada — ${turmaName}`,
      html: layout(
        'Sua vaga está reservada',
        paragraph(`Olá, ${escapeHtml(studentName)}.`) +
          paragraph(
            `Recebemos o sinal da sua matrícula na turma <strong>${escapeHtml(turmaName)}</strong>, com início previsto em <strong>${formatDate(startDate)}</strong>.`,
          ) +
          paragraph(faltam) +
          paragraph(
            'Você acompanha a formação da turma em <strong>Meu Plano</strong>, e o contrato fica em <strong>Meu Perfil › Meus contratos</strong>. Dá para desistir em até 7 dias do pagamento, com o sinal de volta.',
          ),
      ),
    };
  },

  /** Sinal devolvido: desistência, turma cancelada ou adiada. */
  enrollmentRefunded(
    studentName: string,
    turmaName: string,
    reason: 'student' | 'manager' | 'turma-cancelled' | 'overbooked',
  ): EmailContent {
    const motivo = {
      student: 'Recebemos a sua desistência.',
      manager: 'A escola devolveu o seu sinal.',
      'turma-cancelled': 'A turma foi cancelada.',
      overbooked:
        'A última vaga foi ocupada um instante antes do seu pagamento cair.',
    }[reason];
    return {
      subject: `Sinal devolvido — ${turmaName}`,
      html: layout(
        'Sinal devolvido',
        paragraph(`Olá, ${escapeHtml(studentName)}.`) +
          paragraph(
            `${motivo} O sinal da matrícula na turma <strong>${escapeHtml(turmaName)}</strong> volta pelo mesmo meio de pagamento.`,
          ) +
          paragraph(
            'No cartão, o estorno aparece na fatura conforme o prazo do banco emissor.',
          ),
      ),
    };
  },

  /** Para as gerentes: a turma pode ser confirmada. */
  turmaMinimumReached(
    turmaName: string,
    paid: number,
    min: number,
    startDate: string,
  ): EmailContent {
    return {
      subject: `Turma pronta para confirmar — ${turmaName}`,
      html: layout(
        'A turma atingiu o mínimo',
        paragraph(
          `A turma <strong>${escapeHtml(turmaName)}</strong> tem <strong>${paid}</strong> matrículas pagas (mínimo ${min}) e começa em <strong>${formatDate(startDate)}</strong>.`,
        ) +
          paragraph(
            'Confirme em <strong>Gestão › Turmas</strong> para os alunos receberem a cobrança do plano.',
          ),
      ),
    };
  },

  /** Para as gerentes: 7 dias antes do start, a turma ainda não foi confirmada. */
  turmaStartReminder(
    turmaName: string,
    paid: number,
    min: number,
    startDate: string,
  ): EmailContent {
    const situacao =
      paid >= min
        ? `Ela já tem o mínimo (${paid} de ${min}) e só falta confirmar.`
        : `Ela tem ${paid} de ${min} matrículas pagas: abaixo do mínimo.`;
    return {
      subject: `Turma começa em 7 dias — ${turmaName}`,
      html: layout(
        'Decida a turma',
        paragraph(
          `A turma <strong>${escapeHtml(turmaName)}</strong> começa em <strong>${formatDate(startDate)}</strong> e ainda não foi confirmada. ${situacao}`,
        ) +
          paragraph(
            'Em <strong>Gestão › Turmas</strong> você confirma, adia o início ou cancela a turma (o sinal é devolvido a todos).',
          ),
      ),
    };
  },

  /** Para o aluno: turma confirmada, falta pagar o plano. */
  turmaConfirmed(
    studentName: string,
    turmaName: string,
    startDate: string,
  ): EmailContent {
    return {
      subject: `Turma confirmada — ${turmaName}`,
      html: layout(
        'Sua turma vai começar',
        paragraph(`Olá, ${escapeHtml(studentName)}.`) +
          paragraph(
            `A turma <strong>${escapeHtml(turmaName)}</strong> foi confirmada e começa em <strong>${formatDate(startDate)}</strong>.`,
          ) +
          paragraph(
            'Pague o plano em <strong>Meu Plano</strong> até o início — o sinal já está descontado. O acesso às aulas e aos materiais abre na data de início.',
          ),
      ),
    };
  },

  /** Para o aluno: start adiado, com o direito ao estorno do sinal. */
  turmaPostponed(
    studentName: string,
    turmaName: string,
    from: string,
    to: string,
  ): EmailContent {
    return {
      subject: `Início adiado — ${turmaName}`,
      html: layout(
        'O início da turma mudou',
        paragraph(`Olá, ${escapeHtml(studentName)}.`) +
          paragraph(
            `O início da turma <strong>${escapeHtml(turmaName)}</strong> passou de ${formatDate(from)} para <strong>${formatDate(to)}</strong>, no mesmo dia da semana e horário.`,
          ) +
          paragraph(
            'Se a nova data não servir, você pode desistir em <strong>Meu Plano</strong> até o novo início e recebe o sinal de volta.',
          ),
      ),
    };
  },

  /** Para o aluno: turma cancelada, sinal devolvido. */
  turmaCancelled(studentName: string, turmaName: string): EmailContent {
    return {
      subject: `Turma cancelada — ${turmaName}`,
      html: layout(
        'A turma foi cancelada',
        paragraph(`Olá, ${escapeHtml(studentName)}.`) +
          paragraph(
            `A turma <strong>${escapeHtml(turmaName)}</strong> não vai acontecer. O seu sinal foi devolvido pelo mesmo meio de pagamento.`,
          ) +
          paragraph(
            'Quando abrirmos uma nova turma, ela aparece na página da Academy.',
          ),
      ),
    };
  },
};
