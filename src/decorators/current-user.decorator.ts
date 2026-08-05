import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '../types/role';

/** Payload do ID Token do Firebase anexado pelo AuthGuard. */
export interface AuthenticatedUser {
  /** `uid` do Firebase, que é também o id do documento em `users`. */
  sub: string;
  email: string;
  role: Role;
  /**
   * Vem do próprio token (spec 016 Task 78). Nenhuma rota **bloqueia** por
   * este campo: ele é sinalizado na tela de perfil, e barrar aqui trancaria a
   * base inteira migrada por causa de um e-mail que talvez nunca chegue.
   */
  emailVerified?: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    return context.switchToHttp().getRequest().user;
  },
);
