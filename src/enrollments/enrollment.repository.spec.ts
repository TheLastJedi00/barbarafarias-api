import { EnrollmentRepository } from './enrollment.repository';
import {
  ENROLLMENT_STATUS,
  Enrollment,
  countsForSeat,
  isLiveEnrollment,
} from './enrollment.model';

/**
 * Matrícula (spec 036 §3): a vaga reservada numa turma em formação, paga com
 * o sinal. Uma viva por aluno; só a paga ocupa vaga.
 */
function makeDb() {
  const store = new Map<string, Record<string, any>>();
  let seq = 0;
  const match = (data: Record<string, any>, field: string, value: unknown) =>
    field.split('.').reduce<any>((acc, key) => acc?.[key], data) === value;
  const query = (field: string, value: unknown, max = Infinity) => ({
    limit: (n: number) => query(field, value, n),
    async get() {
      return {
        docs: [...store.entries()]
          .filter(([, data]) => match(data, field, value))
          .slice(0, max)
          .map(([id, data]) => ({ id, data: () => data })),
      };
    },
  });
  return {
    store,
    collection: () => ({
      doc: (id?: string) => ({
        id: id ?? `e${++seq}`,
        async get() {
          const data = store.get(id!);
          return { exists: data !== undefined, id, data: () => data };
        },
        async set(data: Record<string, any>) {
          store.set(id!, data);
        },
      }),
      where: (field: string, _op: string, value: unknown) =>
        query(field, value),
    }),
  };
}

const matricula = (extra: Partial<Enrollment> = {}): Enrollment => ({
  id: 'm1',
  studentId: 'a1',
  studentName: 'Bia',
  turmaId: 't1',
  tierId: 'weekly-group',
  mode: 'PACKAGE',
  paymentMethod: 'PIX_RECURRING',
  feeAmount: 150,
  status: ENROLLMENT_STATUS.PENDING,
  gateway: {},
  termsVersion: '2026-11-1',
  createdAt: '2026-11-21T12:00:00.000Z',
  updatedAt: '2026-11-21T12:00:00.000Z',
  ...extra,
});

describe('Enrollment (spec 036)', () => {
  it('viva = pendente ou paga; só a paga ocupa vaga', () => {
    expect(isLiveEnrollment(matricula())).toBe(true);
    expect(isLiveEnrollment(matricula({ status: 'PAID' }))).toBe(true);
    expect(isLiveEnrollment(matricula({ status: 'REFUNDED' }))).toBe(false);
    expect(isLiveEnrollment(matricula({ status: 'CONVERTED' }))).toBe(false);
    expect(countsForSeat(matricula())).toBe(false);
    expect(countsForSeat(matricula({ status: 'PAID' }))).toBe(true);
    expect(countsForSeat(matricula({ status: 'CONVERTED' }))).toBe(true);
  });
});

describe('EnrollmentRepository (spec 036)', () => {
  it('grava e relê; acha por aluno, por turma e pela order', async () => {
    const db = makeDb();
    const repository = new EnrollmentRepository(db as any);
    await repository.save(matricula({ gateway: { orderId: 'ORD1' } }));
    await repository.save(matricula({ id: 'm2', studentId: 'a2' }));

    expect(await repository.findById('m1')).toMatchObject({
      feeAmount: 150,
      mode: 'PACKAGE',
    });
    expect((await repository.findByStudent('a1')).map((e) => e.id)).toEqual([
      'm1',
    ]);
    expect((await repository.findByTurma('t1')).map((e) => e.id)).toEqual([
      'm1',
      'm2',
    ]);
    expect((await repository.findByOrderId('ORD1'))?.id).toBe('m1');
    expect(await repository.findByOrderId('nada')).toBeNull();
  });

  it('não grava undefined (o Firestore recusa)', async () => {
    const db = makeDb();
    const repository = new EnrollmentRepository(db as any);
    await repository.save(matricula({ couponCode: undefined }));
    expect(db.store.get('m1')).not.toHaveProperty('couponCode');
  });
});
