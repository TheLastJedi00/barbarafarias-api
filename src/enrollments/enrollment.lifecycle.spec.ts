import { ConflictException } from '@nestjs/common';
import {
  AGORA,
  ALUNA,
  MATRICULA_CARTAO,
  MATRICULA_PIX,
  buildEnrollments,
  matriculaPaga,
} from './enrollment.fixtures';

/**
 * Sinal confirmado pelo webhook, corrida na última vaga, a leitura do Meu
 * Plano e a desistência (spec 036 §5).
 */
const PAGA = { status: 'processed', status_detail: 'accredited' } as const;

describe('EnrollmentService — webhook e desistência (spec 036)', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(AGORA);
  });
  afterAll(() => jest.useRealTimers());

  describe('webhook', () => {
    it('order paga confirma o sinal e avisa o aluno com quantos faltam', async () => {
      const t = buildEnrollments();
      const { enrollment } = await t.service.create(ALUNA, MATRICULA_PIX);

      await expect(
        t.service.handleOrderEvent('ORD-PIX', PAGA as any),
      ).resolves.toBe(true);
      expect(t.enrollments.store.get(enrollment.id)!.status).toBe('PAID');
      // mínimo 2 na turma de teste: falta 1.
      expect(t.notifications.enrollmentPaid).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ id: 't1' }),
        1,
      );
    });

    it('order de outra coisa não é da matrícula', async () => {
      const t = buildEnrollments();
      await expect(
        t.service.handleOrderEvent('ORD-LOJA', PAGA as any),
      ).resolves.toBe(false);
    });

    it('reentrega do webhook não paga duas vezes', async () => {
      const t = buildEnrollments();
      await t.service.create(ALUNA, MATRICULA_PIX);
      await t.service.handleOrderEvent('ORD-PIX', PAGA as any);
      await t.service.handleOrderEvent('ORD-PIX', PAGA as any);
      expect(t.notifications.enrollmentPaid).toHaveBeenCalledTimes(1);
    });

    it('ao atingir o mínimo, a gerente é avisada uma vez só', async () => {
      const t = buildEnrollments({ enrollments: [matriculaPaga()] });
      await t.service.create(ALUNA, MATRICULA_PIX);
      await t.service.handleOrderEvent('ORD-PIX', PAGA as any);

      expect(t.notifications.turmaMinimumReached).toHaveBeenCalledTimes(1);
      expect(t.turmas.current().minReachedNotifiedAt).toBeDefined();
    });

    it('vaga vendida duas vezes: o pagamento excedente é estornado', async () => {
      const t = buildEnrollments();
      const { enrollment } = await t.service.create(ALUNA, MATRICULA_PIX);
      // Enquanto o PIX dela não caía, as 3 vagas foram pagas por outros.
      for (const id of ['x1', 'x2', 'x3']) {
        t.enrollments.store.set(id, matriculaPaga({ id, studentId: id }));
      }
      await t.service.handleOrderEvent('ORD-PIX', PAGA as any);

      expect(t.gateway.refundOrder).toHaveBeenCalledWith(
        'ORD-PIX',
        `enrollment:${enrollment.id}`,
      );
      expect(t.enrollments.store.get(enrollment.id)!.status).toBe('REFUNDED');
      expect(t.notifications.enrollmentRefunded).toHaveBeenCalledWith(
        'a1',
        expect.anything(),
        'overbooked',
      );
    });

    it('order expirada encerra a pendente', async () => {
      const t = buildEnrollments();
      const { enrollment } = await t.service.create(ALUNA, MATRICULA_PIX);
      await t.service.handleOrderEvent('ORD-PIX', {
        status: 'expired',
        status_detail: 'expired',
      } as any);
      expect(t.enrollments.store.get(enrollment.id)!.status).toBe('CANCELLED');
    });
  });

  describe('Meu Plano', () => {
    it('mostra a matrícula com a turma, pagos e o prazo de desistência', async () => {
      const t = buildEnrollments({ enrollments: [matriculaPaga()] });
      await t.service.create(ALUNA, MATRICULA_PIX);
      await t.service.handleOrderEvent('ORD-PIX', PAGA as any);

      const view = await t.service.mine(ALUNA);
      expect(view).toMatchObject({
        enrollment: { status: 'PAID' },
        turma: { id: 't1', paid: 2, minStudents: 2, startDate: '2026-12-01' },
        withdrawUntil: '2026-11-28',
      });
      expect(JSON.stringify(view)).not.toContain('Outra');
    });

    it('sem matrícula, null', async () => {
      const t = buildEnrollments();
      await expect(t.service.mine(ALUNA)).resolves.toBeNull();
    });
  });

  describe('desistência', () => {
    it('nos 7 dias: estorna pelo gateway de origem', async () => {
      const t = buildEnrollments();
      const { enrollment } = await t.service.create(ALUNA, MATRICULA_CARTAO);
      await t.service.payWithCard(ALUNA, { token: 't', paymentMethodId: 'm' });

      const res = await t.service.withdraw(ALUNA);
      expect(res.status).toBe('REFUNDED');
      expect(res.refund?.by).toBe('student');
      expect(t.gateway.refundOrder).toHaveBeenCalledWith(
        'ORD-CARD',
        `enrollment:${enrollment.id}`,
      );
    });

    it('depois dos 7 dias, sem adiamento: não devolve', async () => {
      const t = buildEnrollments({
        enrollments: [
          matriculaPaga({
            studentId: 'a1',
            paidAt: '2026-11-01T12:00:00.000Z',
          }),
        ],
      });
      await expect(t.service.withdraw(ALUNA)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(t.gateway.refundOrder).not.toHaveBeenCalled();
    });

    it('turma adiada depois do pagamento: devolve até o novo início', async () => {
      const t = buildEnrollments({
        turma: {
          startDate: '2026-12-08',
          startHistory: [
            {
              from: '2026-12-01',
              to: '2026-12-08',
              at: '2026-11-20T12:00:00.000Z',
              by: 'g',
            },
          ],
        },
        enrollments: [
          matriculaPaga({
            studentId: 'a1',
            paidAt: '2026-11-01T12:00:00.000Z',
          }),
        ],
      });
      const res = await t.service.withdraw(ALUNA);
      expect(res.status).toBe('REFUNDED');
    });

    it('pendente: só encerra, sem estorno', async () => {
      const t = buildEnrollments();
      await t.service.create(ALUNA, MATRICULA_PIX);
      const res = await t.service.withdraw(ALUNA);
      expect(res.status).toBe('CANCELLED');
      expect(t.gateway.refundOrder).not.toHaveBeenCalled();
    });
  });
});
