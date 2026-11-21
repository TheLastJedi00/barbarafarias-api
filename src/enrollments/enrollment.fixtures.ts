import { EnrollmentService } from './enrollment.service';
import { Enrollment } from './enrollment.model';
import { Turma, TURMA_STATUS } from '../turmas/turma.entity';
import { DEFAULT_TIERS, type PlanTier } from '../plan-tiers/plan-tier.model';
import { ENROLLMENT_TERMS_VERSION } from './enrollment-terms';

/**
 * Montagem do `EnrollmentService` com tudo falso (spec 036). Relógio fixo em
 * 21/11/2026 12:00 de Brasília; a turma de teste começa em 01/12/2026, terça.
 */
export const AGORA = new Date('2026-11-21T15:00:00.000Z');

export function turmaDe(extra: Partial<Turma> = {}): Turma {
  return new Turma('Grupo semanal · terça 19:00', [], [], 't1', {
    tierId: 'weekly-group',
    dayOfWeek: 2,
    hour: 19,
    startDate: '2026-12-01',
    minStudents: 2,
    maxStudents: 3,
    status: TURMA_STATUS.FORMING,
    teacherId: 'prof-1',
    teacherName: 'Ana Souza',
    startHistory: [],
    ...extra,
  });
}

export function grupoDe(extra: Partial<PlanTier> = {}): PlanTier {
  return {
    ...DEFAULT_TIERS['weekly-group'],
    active: true,
    packagePrice: 1200,
    monthlyPrice: 230,
    enrollmentFee: 150,
    ...extra,
  };
}

export function buildEnrollments(
  options: {
    turma?: Partial<Turma>;
    tier?: Partial<PlanTier>;
    subscription?: { status: string } | null;
    enrollments?: Enrollment[];
    devMode?: boolean;
  } = {},
) {
  const store = new Map<string, Enrollment>(
    (options.enrollments ?? []).map((e) => [e.id, { ...e }]),
  );
  let seq = 0;
  const enrollments = {
    store,
    newId: jest.fn(() => `m${++seq}`),
    findById: jest.fn(async (id: string) =>
      store.has(id) ? { ...store.get(id)! } : null,
    ),
    findByStudent: jest.fn(async (id: string) =>
      [...store.values()]
        .filter((e) => e.studentId === id)
        .map((e) => ({ ...e })),
    ),
    findByTurma: jest.fn(async (id: string) =>
      [...store.values()]
        .filter((e) => e.turmaId === id)
        .map((e) => ({ ...e })),
    ),
    findByOrderId: jest.fn(async (orderId: string) => {
      const found = [...store.values()].find(
        (e) => e.gateway.orderId === orderId,
      );
      return found ? { ...found } : null;
    }),
    save: jest.fn(async (e: Enrollment) => {
      store.set(e.id, { ...e });
      return e;
    }),
  };
  let turma = turmaDe(options.turma);
  const turmas = {
    findById: jest.fn(async (id: string) => (id === turma.id ? turma : null)),
    save: jest.fn(async (t: Turma) => {
      turma = t;
      return t;
    }),
    current: () => turma,
  };
  const planTiers = {
    getEffective: jest.fn(async () => grupoDe(options.tier)),
  };
  const users = {
    findById: jest.fn(async (id: string) => ({
      id,
      fullName: 'Bia Lima',
      email: 'bia@x.com',
      phone: '11999999999',
      cpf: '39053344705',
    })),
  };
  const subscriptions = {
    findByStudent: jest.fn(async () =>
      options.subscription === undefined ? null : options.subscription,
    ),
  };
  const coupons = {
    validateCoupon: jest.fn(async (code: string) => ({
      code: code.toUpperCase(),
      discountAmount: 100,
      durationMonths: null,
    })),
  };
  const gateway = {
    isEnabled: jest.fn(() => true),
    createPixCharge: jest.fn(async (_input: any) => ({
      id: 'ORD-PIX',
      brCode: '000201…',
      brCodeBase64: 'data:image/png;base64,AAA',
    })),
    createCheckout: jest.fn(async (_input: any) => ({
      id: 'ORD-CARD',
      provider: 'MERCADOPAGO',
      outcome: 'PAID',
    })),
    fetchChargeOutcome: jest.fn(async () => ({
      id: 'ORD-CARD',
      provider: 'MERCADOPAGO',
      outcome: 'PENDING',
    })),
    refundOrder: jest.fn(async () => ({ status: 'refunded' })),
  };
  const contracts = { recordSafely: jest.fn(async (input: unknown) => input) };
  const notifications = {
    enrollmentPaid: jest.fn(async () => undefined),
    enrollmentRefunded: jest.fn(async () => undefined),
    turmaMinimumReached: jest.fn(async () => undefined),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'DEV_MODE' && options.devMode ? 'true' : undefined,
    ),
  };

  const service = new EnrollmentService(
    enrollments as any,
    turmas as any,
    planTiers as any,
    users as any,
    subscriptions as any,
    coupons as any,
    gateway as any,
    gateway as any,
    contracts as any,
    notifications as any,
    config as any,
  );
  return {
    service,
    enrollments,
    turmas,
    planTiers,
    users,
    subscriptions,
    coupons,
    gateway,
    contracts,
    notifications,
  };
}

export const ALUNA = {
  sub: 'a1',
  email: 'bia@x.com',
  role: 'student' as const,
};

export const MATRICULA_PIX = {
  turmaId: 't1',
  mode: 'PACKAGE' as const,
  paymentMethod: 'PIX_RECURRING' as const,
  acceptance: {
    termsVersion: ENROLLMENT_TERMS_VERSION,
    accepted: true as const,
  },
};

export const MATRICULA_CARTAO = {
  ...MATRICULA_PIX,
  paymentMethod: 'CREDIT_CARD' as const,
};

export function matriculaPaga(extra: Partial<Enrollment> = {}): Enrollment {
  return {
    id: 'pago-1',
    studentId: 'outra',
    studentName: 'Outra',
    turmaId: 't1',
    tierId: 'weekly-group',
    mode: 'PACKAGE',
    paymentMethod: 'PIX_RECURRING',
    feeAmount: 150,
    status: 'PAID',
    gateway: { orderId: 'ORD-OUTRA' },
    termsVersion: ENROLLMENT_TERMS_VERSION,
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
    paidAt: '2026-11-20T12:00:00.000Z',
    ...extra,
  };
}
