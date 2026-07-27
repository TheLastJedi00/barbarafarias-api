import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '../types/role';

/** Payload do JWT anexado pelo AuthGuard. */
export interface AuthenticatedUser {
  sub: string;
  email: string;
  role: Role;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    return context.switchToHttp().getRequest().user;
  },
);
