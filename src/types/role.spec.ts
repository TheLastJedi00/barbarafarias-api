import { ROLES, isStaff, resolveRole } from './role';

describe('role (spec 028)', () => {
  describe('resolveRole', () => {
    it('reconhece o papel de candidato', () => {
      expect(resolveRole({ role: 'candidate' })).toBe(ROLES.CANDIDATE);
    });

    it('papel desconhecido continua caindo no menor privilégio de aluno', () => {
      expect(resolveRole({ role: 'admin' })).toBe(ROLES.STUDENT);
    });
  });

  describe('isStaff', () => {
    it('candidato não é equipe', () => {
      expect(isStaff(ROLES.CANDIDATE)).toBe(false);
    });

    it('gerente e professora são equipe', () => {
      expect(isStaff(ROLES.MANAGER)).toBe(true);
      expect(isStaff(ROLES.TEACHER)).toBe(true);
    });
  });
});
