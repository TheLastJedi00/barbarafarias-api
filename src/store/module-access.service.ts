import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import { Level } from '../types/student.level';
import { hasPaidAccess } from '../users/paid-access';
import { USER_TIER } from '../users/user.entity';
import { UserRepository } from '../users/user.repository';
import { STORE_PRODUCT_KIND } from './store-product.model';
import { isPurchaseActive } from './store-purchase.model';
import { StorePurchaseRepository } from './store-purchase.repository';

/**
 * Como a pessoa enxerga um módulo (spec 032 §4):
 *
 * - `full`: equipe, ou assinante em dia do mesmo nível — tudo, como antes;
 * - `store`: compra válida na loja — vídeos e **só PDFs, só leitura**;
 * - `payment-pending`: aluno do plano, do próprio nível, sem acesso pago. É o
 *   caso que o `ActivePlanGuard` respondia com 403 e a mensagem que o front
 *   reconhece; continua sendo, para ele saber que é só regularizar.
 */
export type ModuleAccess =
  | { mode: 'full' }
  | { mode: 'store'; purchaseId: string; accessUntil: string }
  | { mode: 'payment-pending' };

/**
 * Quem vê qual módulo. **Calculado a cada pedido**, nunca gravado: vencimento,
 * reembolso e contestação cortam o acesso na hora, sem tarefa agendada.
 *
 * Mora na loja e é exportado: as vídeo aulas o consultam, e a dependência fica
 * numa direção só (o módulo de vídeo importa a loja, nunca o contrário).
 */
@Injectable()
export class ModuleAccessService {
  constructor(
    private readonly users: UserRepository,
    private readonly purchases: StorePurchaseRepository,
  ) {}

  async resolve(
    requester: AuthenticatedUser,
    level: Level,
    moduleId: string,
  ): Promise<ModuleAccess | null> {
    if (requester.role !== ROLES.STUDENT) return { mode: 'full' };

    const user = await this.users.findById(requester.sub);
    if (!user) return null;

    const ownLevel = user.level === level;
    if (ownLevel && hasPaidAccess(user)) return { mode: 'full' };

    const purchase = (await this.purchases.findByUser(requester.sub)).find(
      (p) =>
        p.kind === STORE_PRODUCT_KIND.MODULE &&
        p.moduleId === moduleId &&
        isPurchaseActive(p),
    );
    if (purchase) {
      return {
        mode: 'store',
        purchaseId: purchase.id,
        accessUntil: purchase.accessUntil!,
      };
    }

    // O aluno do plano no próprio nível, em atraso: o que falta é pagar.
    // O comprador da loja não entra aqui — o plano nunca foi dele.
    if (ownLevel && user.tier !== USER_TIER.MODULES) {
      return { mode: 'payment-pending' };
    }
    return null;
  }
}
