import { BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.entity';
import { ROLES } from '../types/role';

/**
 * Valor na concessão manual (spec 026 §9–§10): conceder registra o recebido,
 * revogar pode estornar ou manter. O acesso em si continua sendo a regra da
 * spec 025 — os testes de lá cobrem a soma de datas.
 */
describe('UserService.setAccessGrant — valor e estorno (spec 026)', () => {
  let userRepository: { findById: jest.Mock; updateManualAccess: jest.Mock };
  let manualPayments: {
    create: jest.Mock;
    findByStudent: jest.Mock;
    markVoided: jest.Mock;
  };
  let service: UserService;

  const aluno = (extra: Partial<User> = {}) =>
    new User({ id: 'a1', fullName: 'Ana', role: ROLES.STUDENT, ...extra });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-14T12:00:00.000Z'));
    userRepository = {
      findById: jest.fn().mockResolvedValue(aluno()),
      updateManualAccess: jest.fn().mockResolvedValue(undefined),
    };
    manualPayments = {
      create: jest.fn(async (payment) => ({ id: 'mp-1', ...payment })),
      findByStudent: jest.fn().mockResolvedValue([]),
      markVoided: jest.fn().mockResolvedValue(undefined),
    };
    service = new UserService(
      userRepository as any,
      {} as any,
      manualPayments as any,
    );
  });
  afterEach(() => jest.useRealTimers());

  it('concessão com valor grava o lançamento com o mesmo accessUntil', async () => {
    await service.setAccessGrant('a1', true, {
      amount: 199.9,
      actorId: 'gerente',
    });

    expect(userRepository.updateManualAccess).toHaveBeenCalledWith(
      'a1',
      '2026-09-13',
    );
    expect(manualPayments.create).toHaveBeenCalledWith({
      studentId: 'a1',
      studentName: 'Ana',
      amount: 199.9,
      grantedAt: '2026-08-14T12:00:00.000Z',
      month: '2026-08',
      accessUntil: '2026-09-13',
      grantedBy: 'gerente',
    });
  });

  it('cortesia (zero) também vira lançamento', async () => {
    await service.setAccessGrant('a1', true, { amount: 0 });

    expect(manualPayments.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 0 }),
    );
  });

  it('concessão sem amount continua funcionando e não grava lançamento', async () => {
    const result = await service.setAccessGrant('a1', true);

    expect(result.manualAccessUntil).toBe('2026-09-13');
    expect(manualPayments.create).not.toHaveBeenCalled();
  });

  it('falha ao gravar o lançamento desfaz o acesso e sobe o erro', async () => {
    userRepository.findById.mockResolvedValue(
      aluno({ manualAccessUntil: '2026-08-31' }),
    );
    manualPayments.create.mockRejectedValueOnce(new Error('firestore'));

    await expect(
      service.setAccessGrant('a1', true, { amount: 100 }),
    ).rejects.toThrow('firestore');
    expect(userRepository.updateManualAccess).toHaveBeenLastCalledWith(
      'a1',
      '2026-08-31',
    );
  });

  it('revogar com estorno marca o último lançamento não estornado', async () => {
    manualPayments.findByStudent.mockResolvedValue([
      { id: 'novo', amount: 200 },
      { id: 'velho', amount: 150 },
    ]);

    await service.setAccessGrant('a1', false, {
      refund: true,
      actorId: 'gerente',
    });

    expect(userRepository.updateManualAccess).toHaveBeenCalledWith('a1', null);
    expect(manualPayments.markVoided).toHaveBeenCalledWith(
      'novo',
      '2026-08-14T12:00:00.000Z',
      'gerente',
    );
  });

  it('o estorno pula o que já foi estornado', async () => {
    manualPayments.findByStudent.mockResolvedValue([
      { id: 'estornado', amount: 200, voidedAt: '2026-08-01T00:00:00.000Z' },
      { id: 'valendo', amount: 150 },
    ]);

    await service.setAccessGrant('a1', false, { refund: true });

    expect(manualPayments.markVoided).toHaveBeenCalledWith(
      'valendo',
      expect.any(String),
      '',
    );
  });

  it('revogar mantendo o valor não estorna nada', async () => {
    manualPayments.findByStudent.mockResolvedValue([{ id: 'x', amount: 200 }]);

    await service.setAccessGrant('a1', false, { refund: false });

    expect(userRepository.updateManualAccess).toHaveBeenCalledWith('a1', null);
    expect(manualPayments.markVoided).not.toHaveBeenCalled();
  });

  it('revogar sem dizer se estorna é recusado quando há valor a estornar (Sprint 9)', async () => {
    manualPayments.findByStudent.mockResolvedValue([{ id: 'x', amount: 200 }]);

    await expect(service.setAccessGrant('a1', false)).rejects.toThrow(
      BadRequestException,
    );
    // Recusa antes de gravar: o acesso não pode ser revogado pela metade.
    expect(userRepository.updateManualAccess).not.toHaveBeenCalled();
    expect(manualPayments.markVoided).not.toHaveBeenCalled();
  });

  it('revogar sem refund passa quando a última liberação foi cortesia', async () => {
    manualPayments.findByStudent.mockResolvedValue([{ id: 'c', amount: 0 }]);

    await service.setAccessGrant('a1', false);

    expect(userRepository.updateManualAccess).toHaveBeenCalledWith('a1', null);
  });

  it('revogar sem refund passa quando não há lançamento (concessão anterior à spec)', async () => {
    await service.setAccessGrant('a1', false);

    expect(userRepository.updateManualAccess).toHaveBeenCalledWith('a1', null);
  });

  it('revogar com estorno sem lançamento nenhum só revoga', async () => {
    await service.setAccessGrant('a1', false, { refund: true });

    expect(userRepository.updateManualAccess).toHaveBeenCalledWith('a1', null);
    expect(manualPayments.markVoided).not.toHaveBeenCalled();
  });

  it('lastManualPayment devolve o último não estornado, ou null', async () => {
    manualPayments.findByStudent.mockResolvedValueOnce([
      { id: 'e', amount: 1, voidedAt: 'x' },
      { id: 'v', amount: 2 },
    ]);
    await expect(service.lastManualPayment('a1')).resolves.toMatchObject({
      id: 'v',
    });

    manualPayments.findByStudent.mockResolvedValueOnce([]);
    await expect(service.lastManualPayment('a1')).resolves.toBeNull();
  });
});
