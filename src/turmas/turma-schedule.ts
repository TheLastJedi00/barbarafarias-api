import {
  addDays,
  datesBetween,
  dayOfWeekOf,
  todayInAppTimezone,
} from '../common/time';

/** Os tiers que vendem turma (spec 035): só os de grupo. */
export const GROUP_TIER_IDS = ['weekly-group', 'monthly-group'] as const;
export type GroupTierId = (typeof GROUP_TIER_IDS)[number];

/**
 * Calendário da turma em formação (spec 036 §4).
 *
 * - **Grupo semanal:** toda semana, no `dayOfWeek` da turma.
 * - **Grupo mensal:** no `dayOfWeek`, só nas `weeksOfMonth` escolhidas (duas,
 *   de 1 a 4). Semana do mês = `ceil(dia / 7)`: a "1ª terça" é a terça entre
 *   os dias 1 e 7. A 5ª semana não existe na escolha — nem todo mês tem.
 *
 * Funções puras sobre 'YYYY-MM-DD' (a data de Brasília), como o resto da
 * agenda. Quem decide é este arquivo; o front espelha só para pintar o
 * calendário.
 */
export interface TurmaCalendar {
  tierId: GroupTierId;
  dayOfWeek: number;
  weeksOfMonth?: number[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Quantas datas no máximo procurar ao listar (≈ 2 anos de semanas). */
const SEARCH_LIMIT_DAYS = 800;

/** Semana do mês de uma data: 1 a 5. */
export function weekOfMonth(date: string): number {
  return Math.ceil(Number(date.slice(8, 10)) / 7);
}

/** A data existe no calendário? ('2026-02-30' não existe.) */
function isRealDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  return addDays(date, 0) === date;
}

/** A data cai no calendário da turma (sem olhar se é futura)? */
export function isTurmaDate(calendar: TurmaCalendar, date: string): boolean {
  if (!isRealDate(date)) return false;
  if (dayOfWeekOf(date) !== calendar.dayOfWeek) return false;
  if (calendar.tierId !== 'monthly-group') return true;
  return (calendar.weeksOfMonth ?? []).includes(weekOfMonth(date));
}

/**
 * Pode ser o start? Cai no calendário e é **futura**: no mínimo amanhã em
 * Brasília. Hoje não vale — a turma precisa de um dia para avisar os alunos.
 */
export function isCompatibleStart(
  calendar: TurmaCalendar,
  date: string,
  today: string = todayInAppTimezone(),
): boolean {
  return date > today && isTurmaDate(calendar, date);
}

/** As próximas `count` datas que podem ser start, a partir de amanhã. */
export function nextCompatibleDates(
  calendar: TurmaCalendar,
  count: number,
  today: string = todayInAppTimezone(),
): string[] {
  const dates: string[] = [];
  for (
    let date = addDays(today, 1), i = 0;
    dates.length < count && i < SEARCH_LIMIT_DAYS;
    date = addDays(date, 1), i++
  ) {
    if (isTurmaDate(calendar, date)) dates.push(date);
  }
  return dates;
}

/** As datas de aula da turma no intervalo, nunca antes do start. */
export function turmaDatesBetween(
  calendar: TurmaCalendar & { startDate: string },
  from: string,
  to: string,
): string[] {
  const begin = from < calendar.startDate ? calendar.startDate : from;
  if (begin > to) return [];
  return datesBetween(begin, to).filter((date) => isTurmaDate(calendar, date));
}
