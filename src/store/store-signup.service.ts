import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { LegalService, type AcceptanceMeta } from '../legal/legal.service';
import { ROLES } from '../types/role';
import { USER_TIER, User } from '../users/user.entity';
import { UserRepository } from '../users/user.repository';
import { StoreSignupDto } from './dto/store-signup.dto';

/**
 * Cadastro público da loja (spec 032 §6): o lead vira `student` com
 * `tier: 'modules'`, sem plano (`isPaying: false`).
 *
 * Mesmo desenho do convite e do candidato: o uid nasce aqui e vira o id do
 * doc, e a conta no Firebase é desfeita se o perfil não gravar — nada de conta
 * órfã que logaria sem perfil. E-mail já usado volta 409 do `createAccount`.
 */
@Injectable()
export class StoreSignupService {
  constructor(
    private readonly authService: AuthService,
    private readonly users: UserRepository,
    private readonly legal: LegalService,
  ) {}

  async signup(
    dto: StoreSignupDto,
    meta: AcceptanceMeta,
  ): Promise<{ id: string }> {
    const uid = randomUUID();
    await this.authService.createAccount({
      uid,
      email: dto.email,
      password: dto.password,
      role: ROLES.STUDENT,
    });

    const now = new Date().toISOString();
    const user = new User({
      email: dto.email,
      fullName: dto.fullName,
      phone: dto.phone,
      role: ROLES.STUDENT,
      tier: USER_TIER.MODULES,
      isTeacher: false,
      isPaying: false,
      // Nome e celular já vieram aqui: sem isto o front trataria o comprador
      // como convite pendente e o prenderia na tela de boas-vindas.
      onboardedAt: now,
      createdAt: now,
    });
    user.id = uid;

    try {
      await this.users.save(user, uid);
    } catch (error) {
      await this.authService.deleteAccount(uid);
      throw error;
    }

    await this.acceptAtSignup(uid, meta);
    return { id: uid };
  }

  /** Só os documentos já publicados; o que faltar é pedido depois, pelo modal. */
  private async acceptAtSignup(uid: string, meta: AcceptanceMeta) {
    const types = ['terms-of-use', 'privacy-policy'] as const;
    const published = await Promise.all(
      types.map(async (type) =>
        (await this.legal.requirement(type)).publishedVersion ? type : null,
      ),
    );
    const toAccept = published.filter((t): t is (typeof types)[number] => !!t);
    if (toAccept.length === 0) return;
    await this.legal.accept(
      { sub: uid, email: '', role: ROLES.STUDENT },
      toAccept,
      meta,
    );
  }
}
