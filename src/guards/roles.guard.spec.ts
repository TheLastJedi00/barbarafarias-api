import { RolesGuard } from './roles.guard';
import { ROLES } from '../types/role';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ALLOW_CANDIDATE_KEY } from '../decorators/allow-candidate.decorator';

function makeContext(user: unknown) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('RolesGuard', () => {
  function makeGuard(
    requiredRoles: string[] | undefined,
    allowCandidate?: boolean,
  ) {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === ROLES_KEY
          ? requiredRoles
          : key === ALLOW_CANDIDATE_KEY
            ? allowCandidate
            : undefined,
      ),
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

  it('libera a gerente em rota legada que exige apenas teacher', () => {
    const guard = makeGuard([ROLES.TEACHER]);
    expect(guard.canActivate(makeContext({ role: ROLES.MANAGER }))).toBe(true);
  });

  it('nao libera a professora em rota exclusiva da gerente', () => {
    const guard = makeGuard([ROLES.MANAGER]);
    expect(guard.canActivate(makeContext({ role: ROLES.TEACHER }))).toBe(false);
  });

  describe('candidato (spec 028)', () => {
    const candidato = { role: ROLES.CANDIDATE };

    it('é barrado em rota sem @Roles: ali "não aluno" costuma valer como equipe', () => {
      expect(makeGuard(undefined).canActivate(makeContext(candidato))).toBe(
        false,
      );
    });

    it('passa em rota marcada com @AllowCandidate', () => {
      expect(
        makeGuard(undefined, true).canActivate(makeContext(candidato)),
      ).toBe(true);
    });

    it('passa em rota que exige o papel de candidato', () => {
      expect(
        makeGuard([ROLES.CANDIDATE]).canActivate(makeContext(candidato)),
      ).toBe(true);
    });

    it('é barrado em rota de aluno e de equipe', () => {
      expect(
        makeGuard([ROLES.STUDENT]).canActivate(makeContext(candidato)),
      ).toBe(false);
      expect(
        makeGuard([ROLES.MANAGER, ROLES.TEACHER]).canActivate(
          makeContext(candidato),
        ),
      ).toBe(false);
    });

    it('aluno e gerente não entram em rota de candidato', () => {
      const guard = makeGuard([ROLES.CANDIDATE]);
      expect(guard.canActivate(makeContext({ role: ROLES.STUDENT }))).toBe(
        false,
      );
      expect(guard.canActivate(makeContext({ role: ROLES.MANAGER }))).toBe(
        false,
      );
    });

    it('rota sem @Roles continua livre para aluno e equipe', () => {
      const guard = makeGuard(undefined);
      expect(guard.canActivate(makeContext({ role: ROLES.STUDENT }))).toBe(
        true,
      );
    });
  });
});
