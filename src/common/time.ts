/**
 * Utilidades de data no fuso da operação. Toda decisão sensível a horário
 * (janela de entrada na aula, limite de 4h, prazo de 72h) é calculada no
 * servidor neste fuso — nunca no relógio do cliente (spec 010 RNF2).
 */
export const APP_TIMEZONE = 'America/Sao_Paulo';

/** Deslocamento do fuso, em minutos, no instante informado. */
function offsetMinutes(date: Date, timeZone = APP_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  // 'en-US' com hour12:false devolve 24 para a meia-noite; normalizamos.
  const hour = get('hour') % 24;
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  );
  return (asUtc - date.getTime()) / 60000;
}

/**
 * 'YYYY-MM-DD' + hora local do fuso → instante absoluto.
 * `hour` pode ser decimal (8.5 = 08:30): `Date.UTC` trunca frações, então os
 * minutos são passados em separado (spec 011 RF4).
 */
export function zonedDateTimeToUtc(
  date: string,
  hour: number,
  timeZone = APP_TIMEZONE,
): Date {
  const [year, month, day] = date.split('-').map(Number);
  const wholeHours = Math.floor(hour);
  const minutes = Math.round((hour - wholeHours) * 60);
  const naive = Date.UTC(year, month - 1, day, wholeHours, minutes);
  // duas passadas resolvem a virada de horário de verão, se um dia voltar
  let timestamp = naive;
  for (let i = 0; i < 2; i++) {
    timestamp = naive - offsetMinutes(new Date(timestamp), timeZone) * 60000;
  }
  return new Date(timestamp);
}

/** Instante → 'YYYY-MM-DD' no fuso da operação. */
export function toZonedDateString(
  date: Date,
  timeZone = APP_TIMEZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Hoje no fuso da operação, como 'YYYY-MM-DD'. */
export function todayInAppTimezone(now: Date = new Date()): string {
  return toZonedDateString(now);
}

/** Dia da semana (0=domingo) de uma data 'YYYY-MM-DD'. */
export function dayOfWeekOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Soma dias a uma data 'YYYY-MM-DD', devolvendo outra data 'YYYY-MM-DD'. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Lista inclusiva de datas entre `from` e `to`. */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

/**
 * Próxima ocorrência de um dia da semana APÓS a data informada
 * (nunca a própria data — usado para reposição).
 */
export function nextDateForDayOfWeek(after: string, dayOfWeek: number): string {
  let date = addDays(after, 1);
  while (dayOfWeekOf(date) !== dayOfWeek) {
    date = addDays(date, 1);
  }
  return date;
}
