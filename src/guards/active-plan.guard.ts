import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRepository } from '../users/user.repository';
import { hasPaidAccess } from '../users/paid-access';
import { ROLES } from '../types/role';

export const ACTIVE_PLAN_KEY = 'requiresActivePlan';

/**
 * Marca uma rota como conteúdo de aluno pagante (spec 012 RF13). Perfil e
 * painel financeiro **não** levam este decorador: quem está devendo precisa
 * justamente alcançar a tela onde regulariza o pagamento.
 */
export const RequiresActivePlan = () => SetMetadata(ACTIVE_PLAN_KEY, true);

/** Mensagem única, para o frontend reconhecer o motivo do 403. */
export const PAYMENT_PENDING_MESSAGE =
  'Pagamento pendente. Regularize seu plano para liberar este conteúdo.';

/**
 * Terceiro guard global, depois de autenticação e papel: decide se o aluno
 * está em dia. Roda só nas rotas anotadas, e só para alunos — professora e
 * gerente atravessam sem consulta ao banco.
 *
 * A leitura é do documento do aluno, que o `SubscriptionService` mantém
 * alinhado à assinatura (Task 18). Assim o bloqueio funciona tanto para quem
 * assinou quanto para quem a gerente marcou à mão.
 *
 * Desde a spec 023 não basta o `isPaying`: cancelar preserva o que já foi
 * comprado, e `hasPaidAccess` é quem sabe somar as duas metades.
 */
@Injectable()
export class ActivePlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly userRepository: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      ACTIVE_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const user = context.switchToHttp().getRequest().user;
    if (!user || user.role !== ROLES.STUDENT) return true;

    const student = await this.userRepository.findById(user.sub);
    // Aluno sem ficha não é o caso desta barreira — quem responde por isso é a
    // rota, com o 404 dela. Bloquear aqui esconderia o erro real.
    if (!student) return true;

    if (!hasPaidAccess(student)) {
      throw new ForbiddenException(PAYMENT_PENDING_MESSAGE);
    }
    return true;
  }
}
