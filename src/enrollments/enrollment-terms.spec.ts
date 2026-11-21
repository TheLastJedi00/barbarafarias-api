import {
  ENROLLMENT_TERMS_VERSION,
  buildEnrollmentTerms,
} from './enrollment-terms';
import { Turma } from '../turmas/turma.entity';
import { DEFAULT_TIERS } from '../plan-tiers/plan-tier.model';

/**
 * Termo da matrícula (spec 036 §6): montado da turma e do tier, com os números
 * do momento. Diz o que é o sinal, o que acontece se a turma não fechar e a
 * desistência de 7 dias.
 */
const turma = new Turma('Grupo semanal · terça 19:00', [], [], 't1', {
  tierId: 'weekly-group',
  dayOfWeek: 2,
  hour: 19,
  startDate: '2026-12-01',
  minStudents: 5,
  maxStudents: 8,
  teacherName: 'Ana Souza',
});
const tier = {
  ...DEFAULT_TIERS['weekly-group'],
  active: true,
  packagePrice: 1200,
  monthlyPrice: 230,
  enrollmentFee: 150,
};

describe('termo da matrícula (spec 036)', () => {
  it('traz a turma, o sinal, o mínimo e o plano escolhido', () => {
    const termo = buildEnrollmentTerms(turma, tier, 'PACKAGE');
    const texto = JSON.stringify(termo);

    expect(termo.version).toBe(ENROLLMENT_TERMS_VERSION);
    expect(termo.planLabel).toContain('Grupo semanal · terça 19:00');
    expect(texto).toContain('01/12/2026');
    expect(texto).toContain('R$ 150,00');
    expect(texto).toContain('mínimo de 5');
    expect(texto).toContain('pacote de 6 meses');
    expect(texto).toContain('abatido');
  });

  it('assinatura: fala da primeira mensalidade e da fidelidade', () => {
    const texto = JSON.stringify(
      buildEnrollmentTerms(turma, tier, 'SUBSCRIPTION'),
    );
    expect(texto).toContain('primeira mensalidade');
    expect(texto).toContain('fidelidade');
  });

  it('diz o que acontece se a turma não fechar e a desistência de 7 dias', () => {
    const titulos = buildEnrollmentTerms(turma, tier, 'PACKAGE').clauses.map(
      (clause) => clause.title,
    );
    expect(titulos).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/não fechar/i),
        expect.stringMatching(/desistência/i),
      ]),
    );
  });

  it('tier sem sinal não tem termo de matrícula', () => {
    expect(() =>
      buildEnrollmentTerms(turma, { ...tier, enrollmentFee: null }, 'PACKAGE'),
    ).toThrow();
  });
});
