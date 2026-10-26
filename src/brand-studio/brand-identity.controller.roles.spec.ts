import { RolesGuard } from '../guards/roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';
import { BrandIdentityController } from './brand-identity.controller';

/**
 * A identidade visual vai para toda arte que a escola publica: só a gerente
 * mexe. O teste lê o metadado que o guard lê e passa pelo próprio guard, para
 * a regra "a gerente faz tudo que a professora faz" não abrir esta porta.
 */
describe('BrandIdentityController — papéis', () => {
  const required = Reflect.getMetadata(ROLES_KEY, BrandIdentityController);

  function canActivate(role: string) {
    const guard = new RolesGuard({
      getAllAndOverride: (key: string) =>
        key === ROLES_KEY ? required : undefined,
    } as any);
    return guard.canActivate({
      getHandler: () => ({}),
      getClass: () => BrandIdentityController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    } as any);
  }

  it('o controller inteiro é só da gerente', () => {
    expect(required).toEqual([ROLES.MANAGER]);
  });

  it('a gerente entra', () => {
    expect(canActivate(ROLES.MANAGER)).toBe(true);
  });

  it.each([ROLES.TEACHER, ROLES.STUDENT, ROLES.CANDIDATE])(
    '%s recebe 403',
    (role) => {
      expect(canActivate(role)).toBe(false);
    },
  );
});
