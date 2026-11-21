import {
  isCompatibleStart,
  nextCompatibleDates,
  weekOfMonth,
  turmaDatesBetween,
} from './turma-schedule';

/**
 * Datas compatíveis da turma (spec 036 §4). Toda data de start passa por aqui
 * duas vezes: na tela, para só mostrar o que vale, e no backend, que decide.
 *
 * 2026-12-01 é uma terça (dayOfWeek 2).
 */
const SEMANAL = { tierId: 'weekly-group' as const, dayOfWeek: 2 };
const MENSAL = {
  tierId: 'monthly-group' as const,
  dayOfWeek: 2,
  weeksOfMonth: [1, 3],
};

describe('weekOfMonth', () => {
  it('a semana do mês é ceil(dia / 7): 1ª terça cai entre os dias 1 e 7', () => {
    expect(weekOfMonth('2026-12-01')).toBe(1);
    expect(weekOfMonth('2026-12-07')).toBe(1);
    expect(weekOfMonth('2026-12-08')).toBe(2);
    expect(weekOfMonth('2026-12-15')).toBe(3);
    expect(weekOfMonth('2026-12-29')).toBe(5);
  });
});

describe('isCompatibleStart', () => {
  const hoje = '2026-11-21';

  it('semanal: qualquer data futura no dia da semana da turma', () => {
    expect(isCompatibleStart(SEMANAL, '2026-12-01', hoje)).toBe(true);
    expect(isCompatibleStart(SEMANAL, '2026-12-08', hoje)).toBe(true);
    expect(isCompatibleStart(SEMANAL, '2026-12-02', hoje)).toBe(false);
  });

  it('mensal: o dia da semana e uma das semanas escolhidas', () => {
    expect(isCompatibleStart(MENSAL, '2026-12-01', hoje)).toBe(true);
    expect(isCompatibleStart(MENSAL, '2026-12-15', hoje)).toBe(true);
    expect(isCompatibleStart(MENSAL, '2026-12-08', hoje)).toBe(false);
  });

  it('a 5ª semana nunca vale, nem no mensal', () => {
    expect(isCompatibleStart(MENSAL, '2026-12-29', hoje)).toBe(false);
  });

  it('nunca hoje nem no passado', () => {
    expect(isCompatibleStart(SEMANAL, '2026-11-24', '2026-11-24')).toBe(false);
    expect(isCompatibleStart(SEMANAL, '2026-11-17', hoje)).toBe(false);
    expect(isCompatibleStart(SEMANAL, '2026-11-24', '2026-11-23')).toBe(true);
  });

  it('data mal formada não vale', () => {
    expect(isCompatibleStart(SEMANAL, '2026-13-01', hoje)).toBe(false);
    expect(isCompatibleStart(SEMANAL, 'amanhã', hoje)).toBe(false);
  });
});

describe('nextCompatibleDates', () => {
  it('lista as próximas datas válidas, a partir de amanhã', () => {
    expect(nextCompatibleDates(SEMANAL, 3, '2026-11-24')).toEqual([
      '2026-12-01',
      '2026-12-08',
      '2026-12-15',
    ]);
    expect(nextCompatibleDates(MENSAL, 3, '2026-11-21')).toEqual([
      '2026-12-01',
      '2026-12-15',
      '2027-01-05',
    ]);
  });
});

describe('turmaDatesBetween', () => {
  it('as datas de aula do intervalo, sem nada antes do start', () => {
    expect(
      turmaDatesBetween(
        { ...MENSAL, startDate: '2026-12-15' },
        '2026-12-01',
        '2027-01-31',
      ),
    ).toEqual(['2026-12-15', '2027-01-05', '2027-01-19']);
  });
});
