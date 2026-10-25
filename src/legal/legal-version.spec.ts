import { compareVersions, isUpToDate, nextVersion } from './legal-version';

describe('versões dos documentos jurídicos (spec 029)', () => {
  describe('nextVersion', () => {
    it('a primeira publicação é 1.0, com ou sem a marca de novo aceite', () => {
      expect(nextVersion(null, true)).toBe('1.0');
      expect(nextVersion(null, false)).toBe('1.0');
    });

    it('com novo aceite sobe a maior e zera a menor', () => {
      expect(nextVersion('1.3', true)).toBe('2.0');
      expect(nextVersion('9.0', true)).toBe('10.0');
    });

    it('sem novo aceite sobe só a menor', () => {
      expect(nextVersion('1.0', false)).toBe('1.1');
      expect(nextVersion('2.9', false)).toBe('2.10');
    });
  });

  describe('compareVersions', () => {
    it('compara número a número, não como texto', () => {
      expect(compareVersions('1.10', '1.9')).toBeGreaterThan(0);
      expect(compareVersions('2.0', '10.0')).toBeLessThan(0);
      expect(compareVersions('1.0', '1.0')).toBe(0);
    });
  });

  describe('isUpToDate', () => {
    it('em dia com versão igual ou posterior à exigida', () => {
      expect(isUpToDate(['1.0'], '1.0')).toBe(true);
      expect(isUpToDate(['1.0', '2.1'], '2.0')).toBe(true);
    });

    it('pendente sem aceite ou só com versões anteriores', () => {
      expect(isUpToDate([], '1.0')).toBe(false);
      expect(isUpToDate(['1.0', '1.1'], '2.0')).toBe(false);
    });

    it('sem versão exigida (nada publicado), ninguém fica pendente', () => {
      expect(isUpToDate([], null)).toBe(true);
    });
  });
});
