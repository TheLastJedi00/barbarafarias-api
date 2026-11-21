import {
  AGORA,
  buildEnrollments,
  matriculaPaga,
  turmaDe,
} from './enrollment.fixtures';
import { EnrollmentController } from './enrollment.controller';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Vitrine pública das turmas abertas (spec 036 §1, T5): o lead vê dia,
 * horário, início e vagas — **nunca** quem já se matriculou.
 */
describe('turmas abertas (spec 036)', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(AGORA);
  });
  afterAll(() => jest.useRealTimers());

  it('lista a turma em formação com vagas restantes, sem alunos', async () => {
    const t = buildEnrollments({ enrollments: [matriculaPaga()] });
    const lista = await t.service.openTurmas();

    expect(lista).toEqual([
      {
        id: 't1',
        name: 'Grupo semanal · terça 19:00',
        tierId: 'weekly-group',
        dayOfWeek: 2,
        hour: 19,
        startDate: '2026-12-01',
        teacherName: 'Ana Souza',
        minStudents: 2,
        seatsLeft: 2,
        enrollmentFee: 150,
      },
    ]);
    expect(JSON.stringify(lista)).not.toContain('Outra');
  });

  it('esconde lotada, confirmada, cancelada, já começada e sem sinal no tier', async () => {
    const lotada = buildEnrollments({
      enrollments: ['a', 'b', 'c'].map((id) =>
        matriculaPaga({ id, studentId: id }),
      ),
    });
    expect(await lotada.service.openTurmas()).toEqual([]);

    for (const turma of [
      { status: 'CONFIRMED' as const },
      { status: 'CANCELLED' as const },
      { startDate: '2026-11-17' },
    ]) {
      const t = buildEnrollments({ turma });
      expect(await t.service.openTurmas()).toEqual([]);
    }

    const semSinal = buildEnrollments({ tier: { enrollmentFee: null } });
    expect(await semSinal.service.openTurmas()).toEqual([]);
  });

  it('turma antiga, sem tier, nunca aparece', async () => {
    const t = buildEnrollments();
    t.turmas.extra.push(turmaDe({ id: 'velha', tierId: undefined }));
    expect((await t.service.openTurmas()).map((turma) => turma.id)).toEqual([
      't1',
    ]);
  });

  it('a rota é pública', () => {
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        EnrollmentController.prototype.openTurmas,
      ),
    ).toBe(true);
  });
});
