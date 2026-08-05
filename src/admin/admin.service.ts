import { Inject, Injectable, Logger } from '@nestjs/common';
import { Auth } from 'firebase-admin/auth';
import { AdminRepository, RawDoc } from './admin.repository';
import { ROLES, Role, resolveRole } from '../types/role';
import { FIREBASE_AUTH } from '../firestore/firebase-auth.module';

export interface MigrateRolesReport {
  totalUsers: number;
  updatedUsers: number;
  /** Contas cuja Custom Claim de papel foi (re)gravada — spec 016 Task 81. */
  updatedClaims: number;
  /** `uid`s que não têm conta no Firebase: rodar `/admin/migrate-auth`. */
  missingAccounts: string[];
  agendaSlotsMigrated: number;
  agendaSlotsSkipped: number;
}

const KNOWN_ROLES: string[] = Object.values(ROLES);

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly adminRepository: AdminRepository,
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
  ) {}

  /**
   * Migra `isTeacher` → `role` (spec 010 §2.1) e sincroniza a **Custom Claim**
   * do Firebase com o papel resolvido (spec 016 Task 81). Idempotente: só
   * escreve onde o papel está ausente ou fora de sincronia.
   *
   * **A claim só chega ao usuário no próximo token.** Quem for promovido a
   * gerente com a sessão aberta continua com o papel antigo até sair e entrar
   * (ou até o refresh de uma hora) — é característica do Firebase, não uma
   * falha desta rota.
   *
   * Precedência do papel desejado:
   *   1. `users.role`        — já migrado pela app
   *   2. `credentials.role`  — respeita o ajuste manual da gerente, enquanto a
   *                            coleção legada existir (spec 016 Task 84)
   *   3. `isTeacher`         — fallback legado
   */
  async migrateRoles(): Promise<MigrateRolesReport> {
    const [users, credentials] = await Promise.all([
      this.adminRepository.findAll('users'),
      this.adminRepository.findAll('credentials'),
    ]);

    const credentialById = new Map(credentials.map((c) => [c.id, c.data]));

    const userUpdates: { id: string; data: Record<string, any> }[] = [];
    const missingAccounts: string[] = [];
    let updatedClaims = 0;

    for (const user of users) {
      const desired = this.desiredRole(
        user.data,
        credentialById.get(user.id),
      );

      if (user.data.role !== desired) {
        userUpdates.push({ id: user.id, data: { role: desired } });
      }

      const synced = await this.syncRoleClaim(user.id, desired);
      if (synced === 'missing') {
        missingAccounts.push(user.id);
      } else if (synced === 'updated') {
        updatedClaims += 1;
      }
    }

    await this.adminRepository.mergeAll('users', userUpdates);

    const agenda = await this.migrateAgendaSlots(users, credentialById);

    const report: MigrateRolesReport = {
      totalUsers: users.length,
      updatedUsers: userUpdates.length,
      updatedClaims,
      missingAccounts,
      agendaSlotsMigrated: agenda.migrated,
      agendaSlotsSkipped: agenda.skipped,
    };
    this.logger.log(`Migração de papéis: ${JSON.stringify(report)}`);
    return report;
  }

  /**
   * Slots da agenda antigos (docId `${dia}_${hora}`, sem professora) passam a
   * pertencer à gerente — a única professora que existia antes da spec 010.
   * Se não houver exatamente uma gerente, os slots são deixados como estão e
   * reportados, para a gerente decidir manualmente.
   */
  private async migrateAgendaSlots(
    users: RawDoc[],
    credentialById: Map<string, Record<string, any>>,
  ): Promise<{ migrated: number; skipped: number }> {
    const slots = await this.adminRepository.findAll('agenda');
    const pending = slots.filter((slot) => !slot.data.teacherId);
    if (pending.length === 0) {
      return { migrated: 0, skipped: 0 };
    }

    const managers = users.filter(
      (user) =>
        this.desiredRole(user.data, credentialById.get(user.id)) ===
        ROLES.MANAGER,
    );
    if (managers.length !== 1) {
      this.logger.warn(
        `Agenda não migrada: ${managers.length} gerentes encontradas (esperado 1).`,
      );
      return { migrated: 0, skipped: pending.length };
    }

    const manager = managers[0];
    const moves = pending.map((slot) => ({
      fromId: slot.id,
      toId: `${manager.id}_${slot.data.dayOfWeek}_${slot.data.hour}`,
      data: {
        ...slot.data,
        teacherId: manager.id,
        teacherName: manager.data.fullName ?? null,
      },
    }));

    await this.adminRepository.moveAll('agenda', moves);
    return { migrated: moves.length, skipped: 0 };
  }

  /**
   * Grava a claim só quando ela está diferente. Reescrever à toa custaria uma
   * chamada por usuário a cada execução — e a migração é feita para ser
   * rodada de novo sem medo.
   */
  private async syncRoleClaim(
    uid: string,
    desired: Role,
  ): Promise<'updated' | 'unchanged' | 'missing'> {
    try {
      const account = await this.auth.getUser(uid);
      if (account.customClaims?.role === desired) {
        return 'unchanged';
      }
      await this.auth.setCustomUserClaims(uid, { role: desired });
      return 'updated';
    } catch (error: any) {
      if (error?.code === 'auth/user-not-found') {
        return 'missing';
      }
      throw error;
    }
  }

  private desiredRole(
    user: Record<string, any>,
    credential?: Record<string, any>,
  ): Role {
    if (user.role && KNOWN_ROLES.includes(user.role)) {
      return user.role as Role;
    }
    if (credential?.role && KNOWN_ROLES.includes(credential.role)) {
      return credential.role as Role;
    }
    return resolveRole({ isTeacher: user.isTeacher });
  }
}
