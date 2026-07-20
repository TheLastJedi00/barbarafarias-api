import { RolesGuard } from './roles.guard';

function makeContext(user: unknown) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('RolesGuard', () => {
  function makeGuard(requiredRoles: string[] | undefined) {
    const reflector = { get: jest.fn().mockReturnValue(requiredRoles) };
    return new RolesGuard(reflector as any);
  }

  it('libera quando a rota não exige role', () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('bloqueia quando não há usuário autenticado', () => {
    const guard = makeGuard(['teacher']);
    expect(guard.canActivate(makeContext(undefined))).toBe(false);
  });

  it('libera quando o usuário tem a role exigida', () => {
    const guard = makeGuard(['teacher']);
    expect(guard.canActivate(makeContext({ role: 'teacher' }))).toBe(true);
  });

  it('bloqueia quando o usuário tem role diferente', () => {
    const guard = makeGuard(['teacher']);
    expect(guard.canActivate(makeContext({ role: 'student' }))).toBe(false);
  });
});
