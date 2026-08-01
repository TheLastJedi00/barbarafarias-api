import {
  formatSlotHour,
  isValidSlotHour,
  slotGrid,
  slotsOf,
} from './slot-time';

describe('slot-time', () => {
  describe('isValidSlotHour', () => {
    it('aceita horas cheias e meias-horas do expediente', () => {
      expect(isValidSlotHour(8)).toBe(true);
      expect(isValidSlotHour(8.5)).toBe(true);
      expect(isValidSlotHour(20.5)).toBe(true);
    });

    it('recusa frações que não são de 30 minutos', () => {
      expect(isValidSlotHour(8.25)).toBe(false);
      expect(isValidSlotHour(8.75)).toBe(false);
    });

    it('recusa horas fora da janela de atendimento', () => {
      expect(isValidSlotHour(7.5)).toBe(false);
      expect(isValidSlotHour(21)).toBe(false);
      expect(isValidSlotHour(NaN)).toBe(false);
    });
  });

  describe('slotsOf', () => {
    it('uma aula de 1 hora cobre duas meias-horas consecutivas', () => {
      expect(slotsOf(8)).toEqual([8, 8.5]);
      expect(slotsOf(8.5)).toEqual([8.5, 9]);
    });

    it('uma aula de meia hora cobre um slot só', () => {
      expect(slotsOf(8, 1)).toEqual([8]);
    });
  });

  describe('formatSlotHour', () => {
    it('rende o rótulo HH:MM', () => {
      expect(formatSlotHour(8)).toBe('08:00');
      expect(formatSlotHour(8.5)).toBe('08:30');
      expect(formatSlotHour(20.5)).toBe('20:30');
    });
  });

  describe('slotGrid', () => {
    it('vai de 08:00 a 20:30 em passos de 30 min', () => {
      const grid = slotGrid();
      expect(grid[0]).toBe(8);
      expect(grid[1]).toBe(8.5);
      expect(grid[grid.length - 1]).toBe(20.5);
      expect(grid).toHaveLength(26);
    });
  });
});
