import { ForbiddenException } from '@nestjs/common';
import { ActivePlanGuard } from './active-plan.guard';
import { User } from '../users/user.entity';
import { ROLES } from '../types/role';

/**
 * O outro lado da concessão da spec 025: a professora agenda pelo
 * `PaymentAccessService`, e o aluno abre o conteúdo por aqui. Duas portas para
 * a mesma pergunta — e o motivo de a resposta morar no `hasPaidAccess`, e não
 * copiada nas duas.
 */
describe('ActivePlanGuard (spec 025)', () => {
  const hoje = new Date('2026-08-14T12:00:00.000Z');
  let users: { findById: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: ActivePlanGuard;

  const contexto = (user: unknown) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;

  const aluno = { sub: 'a1', role: ROLES.STUDENT };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(hoje);
    users = { findById: jest.fn() };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    guard = new ActivePlanGuard(reflector as any, users as any);
  });

  afterEach(() => jest.useRealTimers());

  const inadimplente = (extra: Partial<User> = {}) =>
    new User({
      id: 'a1',
      fullName: 'Ana',
      isPaying: false,
      subscriptionStatus: 'PAST_DUE',
      ...extra,
    });

  it('barra o aluno sem concessão', async () => {
    users.findById.mockResolvedValue(inadimplente());
    await expect(guard.canActivate(contexto(aluno))).rejects.toThrow(
      ForbiddenException,
    );
  });

  /**
   * A gerente concede e o aluno destrava na requisição seguinte — sem novo
   * login. O guard lê o documento a cada chamada justamente para isso: se o
   * acesso morasse no token, a concessão só valeria depois de a sessão de uma
   * hora expirar, e a gerente veria o clique "não funcionar".
   */
  it('libera na requisição seguinte à concessão, sem novo login', async () => {
    users.findById.mockResolvedValue(
      inadimplente({ manualAccessUntil: '2026-09-13' }),
    );
    await expect(guard.canActivate(contexto(aluno))).resolves.toBe(true);
  });

  it('volta a barrar no dia seguinte ao fim da concessão', async () => {
    users.findById.mockResolvedValue(
      inadimplente({ manualAccessUntil: '2026-08-13' }),
    );
    await expect(guard.canActivate(contexto(aluno))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('professora e gerente atravessam sem consulta ao banco', async () => {
    await expect(
      guard.canActivate(contexto({ sub: 't1', role: ROLES.TEACHER })),
    ).resolves.toBe(true);
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('rota sem o decorador não consulta ninguém', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    await expect(guard.canActivate(contexto(aluno))).resolves.toBe(true);
    expect(users.findById).not.toHaveBeenCalled();
  });
});
