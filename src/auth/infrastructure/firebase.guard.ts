import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './decorators/roles.decorator';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    //define the roles required by the route
    const requiredRoles = this.reflector.get<string[]>(
      ROLES_KEY,
      context.getHandler(),
    );
    //if no roles are required, allow access
    if (!requiredRoles) return true;
    //user from request
    const { user } = context.switchToHttp().getRequest();
    //compare user roles with required roles
    if (requiredRoles.includes('teacher')) {
      return user.isTeacher === true;
    }
    return false;
  }
}
