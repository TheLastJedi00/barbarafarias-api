import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requeredRoles = this.reflector.get<string[]>(
      'roles',
      context.getHandler(),
    );
    if (!requeredRoles) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    return requeredRoles.some((role) => user.role === role);
  }
}
