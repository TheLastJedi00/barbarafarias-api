import { User } from './user.entity';
import { ROLES } from '../types/role';
import {
  missingOnboardingFields,
  onboardingCompletedAt,
  requiresOnboarding,
} from './onboarding';

/**
 * A régua do onboarding (spec 018). O que estes testes protegem é o corte por
 * papel: o mesmo conjunto vazio significa "pode entrar" para o aluno e "não se
 * aplica" para a gerente, e confundir os dois foi o bug da Fase 1.
 */
describe('missingOnboardingFields', () => {
  const completoAluno = {
    role: ROLES.STUDENT,
    fullName: 'Ana',
    phone: '11999999999',
    cpf: '39053344705',
    objective: 'Viajar',
  };
  const completaProfessora = {
    role: ROLES.TEACHER,
    fullName: 'Bárbara',
    phone: '11999999999',
    cpf: '39053344705',
    pixKey: 'barbara@x.com',
  };

  it('cobra do aluno o que o checkout exige, mais nome e objetivo', () => {
    expect(missingOnboardingFields(new User({ role: ROLES.STUDENT }))).toEqual([
      'nome',
      'celular',
      'CPF',
      'objetivo',
    ]);
    expect(missingOnboardingFields(new User(completoAluno))).toEqual([]);
  });

  it('cobra da professora a chave PIX no lugar do objetivo', () => {
    // Ela não paga, ela recebe: o pixKey é o destino do repasse.
    expect(missingOnboardingFields(new User({ role: ROLES.TEACHER }))).toEqual([
      'nome',
      'celular',
      'CPF',
      'chave PIX',
    ]);
    expect(missingOnboardingFields(new User(completaProfessora))).toEqual([]);
    expect(
      missingOnboardingFields(new User({ ...completaProfessora, pixKey: '' })),
    ).toEqual(['chave PIX']);
  });

  it('não cobra nada da gerente', () => {
    expect(missingOnboardingFields(new User({ role: ROLES.MANAGER }))).toEqual(
      [],
    );
    expect(requiresOnboarding(new User({ role: ROLES.MANAGER }))).toBe(false);
  });

  it('alcança documento legado sem `role`, pelo isTeacher', () => {
    // A base ainda tem documentos anteriores ao campo `role` (spec 010).
    expect(missingOnboardingFields(new User({ isTeacher: true }))).toContain(
      'chave PIX',
    );
  });
});

describe('onboardingCompletedAt', () => {
  it('carimba quando o conjunto fecha', () => {
    const user = new User({
      role: ROLES.STUDENT,
      fullName: 'Ana',
      phone: '11999999999',
      cpf: '39053344705',
      objective: 'Viajar',
    });

    expect(onboardingCompletedAt(user)).toEqual(expect.any(String));
  });

  it('não recarimba quem já concluiu', () => {
    // É registro de quando aconteceu, não flag de completude: reescrever faria
    // a data andar toda vez que a pessoa trocasse a foto.
    const user = new User({
      role: ROLES.STUDENT,
      fullName: 'Ana',
      phone: '11999999999',
      cpf: '39053344705',
      objective: 'Viajar',
      onboardedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(onboardingCompletedAt(user)).toBeUndefined();
  });

  it('nunca carimba a gerente, por mais vazio que esteja o documento', () => {
    expect(
      onboardingCompletedAt(new User({ role: ROLES.MANAGER })),
    ).toBeUndefined();
  });
});
