import { BadRequestException, ConflictException } from '@nestjs/common';
import { TurmaLifecycleService } from './turma-lifecycle.service';
import { AGORA, matriculaPaga, turmaDe } from './enrollment.fixtures';
import { Enrollment } from './enrollment.model';
import { Turma } from '../turmas/turma.entity';

/**
 * O ciclo da turma em formação (spec 036 §1, §5, T19 e T21): a gerente
 * confirma, adia ou cancela; o sistema converte, avisa e devolve.
 */
function build(
  options: { turma?: Partial<Turma>; enrollments?: Enrollment[] } = {},
) {
  let turma = turmaDe(options.turma);
  const store = new Map<string, Enrollment>(
    (options.enrollments ?? []).map((e) => [e.id, { ...e }]),
  );
  const turmas = {
    findById: jest.fn(async () => turma),
    findAll: jest.fn(async () => [turma]),
    save: jest.fn(async (next: Turma) => {
      turma = next;
      return next;
    }),
    current: () => turma,
  };
  const enrollments = {
    store,
    findByTurma: jest.fn(async () =>
      [...store.values()].map((e) => ({ ...e })),
    ),
    save: jest.fn(async (e: Enrollment) => {
      store.set(e.id, { ...e });
      return e;
    }),
  };
  const enrollmentService = {
    refund: jest.fn(async (e: Enrollment, by: string) => {
      const refunded = {
        ...e,
        status: 'REFUNDED' as const,
        refund: { by, at: 'x' },
      };
      store.set(e.id, refunded as Enrollment);
      return refunded;
    }),
    cancelPending: jest.fn(async (e: Enrollment) => {
      const cancelled = { ...e, status: 'CANCELLED' as const };
      store.set(e.id, cancelled);
      return cancelled;
    }),
  };
  const subscriptions = {
    createFromEnrollment: jest.fn(async (input: any) => ({
      studentId: input.studentId,
    })),
  };
  const notifications = {
    turmaConfirmed: jest.fn(async () => undefined),
    turmaPostponed: jest.fn(async () => undefined),
    turmaStartReminder: jest.fn(async () => undefined),
  };
  const service = new TurmaLifecycleService(
    turmas as any,
    enrollments as any,
    enrollmentService as any,
    subscriptions as any,
    notifications as any,
  );
  return {
    service,
    turmas,
    enrollments,
    enrollmentService,
    subscriptions,
    notifications,
  };
}

const GERENTE = { sub: 'gerente', email: 'g', role: 'manager' as const };
const pagas = () => [
  matriculaPaga({ id: 'p1', studentId: 'a1', studentName: 'Ana' }),
  matriculaPaga({
    id: 'p2',
    studentId: 'a2',
    studentName: 'Bia',
    mode: 'SUBSCRIPTION',
    couponCode: 'BEMVINDA',
  }),
];

describe('TurmaLifecycleService (spec 036)', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(AGORA);
  });
  afterAll(() => jest.useRealTimers());

  describe('confirmar', () => {
    it('converte cada matrícula paga em plano, com o sinal e o início da turma', async () => {
      const t = build({ enrollments: pagas() });
      const res = await t.service.confirm('t1', {});

      expect(t.subscriptions.createFromEnrollment).toHaveBeenCalledWith({
        studentId: 'a2',
        tierId: 'weekly-group',
        plan: 'SUBSCRIPTION',
        couponCode: 'BEMVINDA',
        credit: 150,
        startDate: '2026-12-01',
      });
      expect(res).toMatchObject({ converted: 2, failed: [] });
      expect(t.enrollments.store.get('p1')!.status).toBe('CONVERTED');
      expect(t.turmas.current()).toMatchObject({
        status: 'CONFIRMED',
        studentIds: ['a1', 'a2'],
        studentNames: ['Ana', 'Bia'],
      });
      expect(t.notifications.turmaConfirmed).toHaveBeenCalledTimes(2);
    });

    it('abaixo do mínimo exige confirmação explícita', async () => {
      const t = build({ enrollments: [matriculaPaga()] });
      await expect(t.service.confirm('t1', {})).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(
        t.service.confirm('t1', { force: true }),
      ).resolves.toMatchObject({ converted: 1 });
    });

    it('a pendente (sinal não pago) é encerrada na confirmação', async () => {
      const t = build({
        enrollments: [
          ...pagas(),
          matriculaPaga({ id: 'pend', status: 'PENDING' }),
        ],
      });
      await t.service.confirm('t1', {});
      expect(t.enrollments.store.get('pend')!.status).toBe('CANCELLED');
    });

    it('uma conversão que falha não derruba as outras e fica no relatório', async () => {
      const t = build({ enrollments: pagas() });
      t.subscriptions.createFromEnrollment.mockRejectedValueOnce(
        new ConflictException('Você já tem um plano.'),
      );
      const res = await t.service.confirm('t1', {});
      expect(res.converted).toBe(1);
      expect(res.failed).toEqual([
        {
          studentId: 'a1',
          studentName: 'Ana',
          reason: 'Você já tem um plano.',
        },
      ]);
      expect(t.enrollments.store.get('p1')!.status).toBe('PAID');
    });

    it('só turma em formação se confirma', async () => {
      const t = build({ turma: { status: 'CANCELLED' }, enrollments: pagas() });
      await expect(t.service.confirm('t1', {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('adiar', () => {
    it('troca o início por outra data compatível, registra e avisa quem pagou', async () => {
      const t = build({ enrollments: pagas(), turma: { reminderSentAt: 'x' } });
      await t.service.postpone('t1', '2026-12-15', GERENTE);

      const turma = t.turmas.current();
      expect(turma.startDate).toBe('2026-12-15');
      expect(turma.startHistory).toEqual([
        expect.objectContaining({
          from: '2026-12-01',
          to: '2026-12-15',
          by: 'gerente',
        }),
      ]);
      expect(turma.reminderSentAt).toBeUndefined();
      expect(t.notifications.turmaPostponed).toHaveBeenCalledTimes(2);
    });

    it('data incompatível ou a mesma é recusada', async () => {
      const t = build();
      await expect(
        t.service.postpone('t1', '2026-12-16', GERENTE),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        t.service.postpone('t1', '2026-12-01', GERENTE),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cancelar', () => {
    it('devolve todos os sinais pagos e encerra as pendentes', async () => {
      const t = build({
        enrollments: [
          ...pagas(),
          matriculaPaga({ id: 'pend', status: 'PENDING' }),
        ],
      });
      const res = await t.service.cancel('t1', GERENTE);

      expect(t.enrollmentService.refund).toHaveBeenCalledTimes(2);
      expect(t.enrollmentService.refund).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1' }),
        'turma-cancelled',
        expect.any(String),
      );
      expect(t.enrollments.store.get('pend')!.status).toBe('CANCELLED');
      expect(t.turmas.current().status).toBe('CANCELLED');
      expect(res).toMatchObject({ refunded: 2, failed: [] });
    });

    it('estorno que falha fica no relatório; cancelar de novo tenta só o que faltou', async () => {
      const t = build({ enrollments: pagas() });
      t.enrollmentService.refund.mockRejectedValueOnce(new Error('MP fora'));
      const primeira = await t.service.cancel('t1', GERENTE);
      expect(primeira).toMatchObject({
        refunded: 1,
        failed: [{ studentId: 'a1' }],
      });
      expect(t.turmas.current().status).toBe('CANCELLED');

      const segunda = await t.service.cancel('t1', GERENTE);
      expect(segunda).toMatchObject({ refunded: 1, failed: [] });
      expect(t.enrollmentService.refund).toHaveBeenCalledTimes(3);
    });

    it('turma confirmada não se cancela por aqui', async () => {
      const t = build({ turma: { status: 'CONFIRMED' } });
      await expect(t.service.cancel('t1', GERENTE)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('visão da gerente', () => {
    it('cada turma com pagos, pendentes e o que falta para o mínimo', async () => {
      const t = build({
        enrollments: [
          ...pagas(),
          matriculaPaga({ id: 'pend', status: 'PENDING' }),
          matriculaPaga({ id: 'dev', status: 'REFUNDED' }),
        ],
      });
      const [linha] = await t.service.overview();
      expect(linha).toMatchObject({
        turma: { id: 't1' },
        paid: 2,
        pending: 1,
      });
    });
  });
});
