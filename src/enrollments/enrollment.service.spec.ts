import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AGORA,
  ALUNA,
  MATRICULA_CARTAO,
  MATRICULA_PIX,
  buildEnrollments,
  matriculaPaga,
} from './enrollment.fixtures';
import { enrollmentReference } from './enrollment.model';

/**
 * Matrícula (spec 036 §1, §3, §5): aceite + contrato + sinal à vista.
 */
describe('EnrollmentService — matrícula (spec 036)', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(AGORA);
  });
  afterAll(() => jest.useRealTimers());

  it('PIX: grava pendente com o sinal congelado, emite o QR e grava o contrato', async () => {
    const t = buildEnrollments();
    const res = await t.service.create(ALUNA, MATRICULA_PIX);

    expect(res.enrollment).toMatchObject({
      status: 'PENDING',
      feeAmount: 150,
      mode: 'PACKAGE',
      turmaId: 't1',
    });
    expect(res.pixCopyPaste).toBe('000201…');
    expect(t.gateway.createPixCharge.mock.calls[0][0]).toMatchObject({
      amount: 150,
      externalId: enrollmentReference(res.enrollment.id),
    });
    expect(t.enrollments.store.get(res.enrollment.id)!.gateway.orderId).toBe(
      'ORD-PIX',
    );

    const contrato = t.contracts.recordSafely.mock.calls[0][0] as any;
    expect(contrato).toMatchObject({
      kind: 'ENROLLMENT',
      refId: res.enrollment.id,
      studentId: 'a1',
    });
    expect(contrato.deal).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Turma' }),
        expect.objectContaining({ label: 'Sinal' }),
      ]),
    );
  });

  it('cartão: não cobra ainda; devolve o valor do sinal à vista', async () => {
    const t = buildEnrollments();
    const res = await t.service.create(ALUNA, MATRICULA_CARTAO);
    expect(res.card).toEqual({ amount: 150, installments: 1 });
    expect(t.gateway.createPixCharge).not.toHaveBeenCalled();
  });

  it('cartão: cobra 1x com o token e marca paga', async () => {
    const t = buildEnrollments();
    const { enrollment } = await t.service.create(ALUNA, MATRICULA_CARTAO);
    const res = await t.service.payWithCard(ALUNA, {
      token: 'tok',
      paymentMethodId: 'master',
    });
    expect(t.gateway.createCheckout.mock.calls[0][0]).toMatchObject({
      amount: 150,
      installments: 1,
      externalId: enrollmentReference(enrollment.id),
    });
    expect(res.outcome).toBe('PAID');
    expect(t.enrollments.store.get(enrollment.id)!.status).toBe('PAID');
  });

  it('o cupom é conferido contra o tier e a modalidade, e fica guardado', async () => {
    const t = buildEnrollments();
    const { enrollment } = await t.service.create(ALUNA, {
      ...MATRICULA_PIX,
      couponCode: 'bemvinda',
    });
    expect(t.coupons.validateCoupon).toHaveBeenCalledWith(
      'bemvinda',
      expect.objectContaining({ tierId: 'weekly-group', plan: 'PACKAGE' }),
    );
    expect(enrollment.couponCode).toBe('BEMVINDA');
  });

  it('sem aceite da versão vigente, nada é criado', async () => {
    const t = buildEnrollments();
    await expect(
      t.service.create(ALUNA, {
        ...MATRICULA_PIX,
        acceptance: { termsVersion: 'velha', accepted: true },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(t.enrollments.save).not.toHaveBeenCalled();
  });

  it('turma lotada não matricula', async () => {
    const t = buildEnrollments({
      enrollments: [
        matriculaPaga({ id: 'p1' }),
        matriculaPaga({ id: 'p2', studentId: 'x2' }),
        matriculaPaga({ id: 'p3', studentId: 'x3' }),
      ],
    });
    await expect(t.service.create(ALUNA, MATRICULA_PIX)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('turma que não está em formação não matricula', async () => {
    const t = buildEnrollments({ turma: { status: 'CONFIRMED' } });
    await expect(t.service.create(ALUNA, MATRICULA_PIX)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('tier sem sinal não abre matrícula', async () => {
    const t = buildEnrollments({ tier: { enrollmentFee: null } });
    await expect(t.service.create(ALUNA, MATRICULA_PIX)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('assinatura num tier sem mensalidade é recusada', async () => {
    const t = buildEnrollments({ tier: { monthlyPrice: null } });
    await expect(
      t.service.create(ALUNA, { ...MATRICULA_PIX, mode: 'SUBSCRIPTION' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('quem já tem plano vivo não se matricula', async () => {
    const t = buildEnrollments({ subscription: { status: 'ACTIVE' } });
    await expect(t.service.create(ALUNA, MATRICULA_PIX)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('quem já tem matrícula paga não abre outra', async () => {
    const t = buildEnrollments({
      enrollments: [matriculaPaga({ studentId: 'a1' })],
    });
    await expect(t.service.create(ALUNA, MATRICULA_PIX)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('matrícula pendente na mesma turma é reaproveitada, não duplicada', async () => {
    const t = buildEnrollments();
    const primeira = await t.service.create(ALUNA, MATRICULA_PIX);
    const segunda = await t.service.create(ALUNA, MATRICULA_PIX);
    expect(segunda.enrollment.id).toBe(primeira.enrollment.id);
    expect(t.enrollments.store.size).toBe(1);
  });

  it('mock-pay só em DEV_MODE', async () => {
    const t = buildEnrollments();
    await t.service.create(ALUNA, MATRICULA_PIX);
    await expect(t.service.mockPay(ALUNA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const dev = buildEnrollments({ devMode: true });
    const { enrollment } = await dev.service.create(ALUNA, MATRICULA_PIX);
    await dev.service.mockPay(ALUNA);
    expect(dev.enrollments.store.get(enrollment.id)!.status).toBe('PAID');
  });

  it('termo: só para turma aberta, com o plano escolhido', async () => {
    const t = buildEnrollments();
    const termo = await t.service.terms('t1', 'SUBSCRIPTION');
    expect(JSON.stringify(termo)).toContain('primeira mensalidade');
  });
});
