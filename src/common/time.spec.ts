import {
  addDays,
  datesBetween,
  dayOfWeekOf,
  nextDateForDayOfWeek,
  toZonedDateString,
  zonedDateTimeToUtc,
} from './time';

describe('time (fuso da operação)', () => {
  it('converte hora local de São Paulo para instante absoluto (UTC-3)', () => {
    const startAt = zonedDateTimeToUtc('2026-08-03', 15);
    expect(startAt.toISOString()).toBe('2026-08-03T18:00:00.000Z');
  });

  it('não desloca o dia ao converter horários da manhã', () => {
    const startAt = zonedDateTimeToUtc('2026-08-03', 8);
    expect(startAt.toISOString()).toBe('2026-08-03T11:00:00.000Z');
    expect(toZonedDateString(startAt)).toBe('2026-08-03');
  });

  it('mantém a data local mesmo quando o UTC já virou o dia', () => {
    // 21h em SP = 00h do dia seguinte em UTC
    const startAt = zonedDateTimeToUtc('2026-08-03', 21);
    expect(startAt.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    expect(toZonedDateString(startAt)).toBe('2026-08-03');
  });

  it('calcula o dia da semana da data local', () => {
    expect(dayOfWeekOf('2026-08-03')).toBe(1); // segunda
    expect(dayOfWeekOf('2026-08-09')).toBe(0); // domingo
  });

  it('soma dias atravessando a virada de mês', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('lista as datas do intervalo de forma inclusiva', () => {
    expect(datesBetween('2026-08-03', '2026-08-05')).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ]);
  });

  it('acha a próxima ocorrência do dia da semana, nunca a própria data', () => {
    // 2026-08-03 é segunda; próxima segunda é dia 10
    expect(nextDateForDayOfWeek('2026-08-03', 1)).toBe('2026-08-10');
    expect(nextDateForDayOfWeek('2026-08-03', 3)).toBe('2026-08-05');
  });
});
