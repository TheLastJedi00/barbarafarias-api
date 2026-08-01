/**
 * Vocabulário de horários da agenda em passos de 30 minutos (spec 011 RF4).
 *
 * A hora é um número decimal: `8` = 08:00, `8.5` = 08:30. Esta representação
 * foi escolhida porque preserva todos os `docId` já gravados
 * (`${teacherId}_${dayOfWeek}_8` continua sendo `..._8`), dispensando migração
 * do Firestore — só as meias-horas novas estreiam ids com `.5`. Também mantém
 * a ordenação numérica (`a.hour - b.hour`) que lessons e billing já usam.
 */

/** Um slot = 30 minutos. */
export const SLOT_STEP = 0.5;

/** Aula padrão = 1 hora = 2 slots consecutivos (spec 011 RF5). */
export const DEFAULT_SLOT_COUNT = 2;

export const FIRST_HOUR = 8;
/** Último início possível: 20:30 encerra às 21:00. */
export const LAST_HOUR = 20.5;

/** Aceita apenas horas cheias e meias-horas dentro da janela de atendimento. */
export function isValidSlotHour(hour: number): boolean {
  if (!Number.isFinite(hour)) return false;
  if (hour < FIRST_HOUR || hour > LAST_HOUR) return false;
  return Math.round(hour * 2) === hour * 2;
}

/** Slots ocupados por um bloco que começa em `startHour`. */
export function slotsOf(
  startHour: number,
  slotCount: number = DEFAULT_SLOT_COUNT,
): number[] {
  return Array.from(
    { length: slotCount },
    (_, index) => startHour + index * SLOT_STEP,
  );
}

/** Grade completa de inícios possíveis, de 08:00 a 20:30. */
export function slotGrid(): number[] {
  const grid: number[] = [];
  for (let hour = FIRST_HOUR; hour <= LAST_HOUR; hour += SLOT_STEP) {
    grid.push(hour);
  }
  return grid;
}

/** `8.5` → `'08:30'`. Usado em e-mails e rótulos. */
export function formatSlotHour(hour: number): string {
  const hours = Math.floor(hour);
  const minutes = Math.round((hour - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Divide a hora decimal em (hora cheia, minutos) para cálculos de data. */
export function splitHour(hour: number): { hours: number; minutes: number } {
  const hours = Math.floor(hour);
  return { hours, minutes: Math.round((hour - hours) * 60) };
}
