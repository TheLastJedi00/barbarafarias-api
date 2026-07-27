import { RolesGuard } from './roles.guard';
import { ROLES } from '../types/role';

function makeContext(user: unknown) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('RolesGuard', () => {
  function makeGuard(requiredRoles: string[] | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
    };
    return new RolesGuard(reflector as any);
  }

  it('libera quando a rota não exige role', () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('bloqueia quando não há usuário autenticado', () => {
    const guard = makeGuard([ROLES.TEACHER]);
    expect(guard.canActivate(makeContext(undefined))).toBe(false);
  });

  it('libera quando o usuário tem a role exigida', () => {
    const guard = makeGuard([ROLES.TEACHER]);
    expect(guard.canActivate(makeContext({ role: ROLES.TEACHER }))).toBe(true);
  });

  it('bloqueia quando o usuário tem role diferente', () => {
    const guard = makeGuard([ROLES.TEACHER]);
    expect(guard.canActivate(makeContext({ role: ROLES.STUDENT }))).toBe(false);
  });

  it('libera a gerente em rota que aceita manager e teacher', () => {
    const guard = makeGuard([ROLES.MANAGER, ROLES.TEACHER]);
    expect(guard.canActivate(makeContext({ role: ROLES.MANAGER }))).toBe(true);
  });

  it('bloqueia o aluno em rota de manager e teacher', () => {
    const guard = makeGuard([ROLES.MANAGER, ROLES.TEACHER]);
    expect(guard.canActivate(makeContext({ role: ROLES.STUDENT }))).toBe(false);
  });
});
