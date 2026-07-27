import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ROLES, Role } from '../types/role';

/**
 * Herança de papéis: a gerente faz tudo que a professora faz (spec 010 §2).
 * Sem isso, migrar a gerente para `manager` a barraria em todas as rotas
 * legadas anotadas com `@Roles(TEACHER)`.
 */
const INHERITED_ROLES: Partial<Record<Role, Role[]>> = {
  [ROLES.MANAGER]: [ROLES.TEACHER],
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // getAllAndOverride permite anotar o controller inteiro (ex.: painel da gerente)
    // e ainda sobrescrever o papel exigido em uma rota específica.
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userFromToken = request.user;

    if (!userFromToken) {
      return false;
    }

    const effectiveRoles: string[] = [
      userFromToken.role,
      ...(INHERITED_ROLES[userFromToken.role as Role] ?? []),
    ];

    return requiredRoles.some((role) => effectiveRoles.includes(role));
  }
}
