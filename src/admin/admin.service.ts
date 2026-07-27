import { Injectable, Logger } from '@nestjs/common';
import { AdminRepository, RawDoc } from './admin.repository';
import { ROLES, Role, resolveRole } from '../types/role';

export interface MigrateRolesReport {
  totalUsers: number;
  updatedUsers: number;
  updatedCredentials: number;
  missingCredentials: string[];
  agendaSlotsMigrated: number;
  agendaSlotsSkipped: number;
}

const KNOWN_ROLES: string[] = Object.values(ROLES);

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly adminRepository: AdminRepository) {}

  /**
   * Migra `isTeacher` → `role` (spec 010 §2.1). Idempotente: só escreve onde o
   * papel está ausente ou fora de sincronia entre `users` e `credentials`.
   *
   * Precedência do papel desejado:
   *   1. `users.role`        — já migrado pela app
   *   2. `credentials.role`  — respeita o ajuste manual da gerente (é o que
   *                            alimenta o JWT), evitando rebaixar manager→teacher
   *   3. `isTeacher`         — fallback legado
   */
  async migrateRoles(): Promise<MigrateRolesReport> {
    const [users, credentials] = await Promise.all([
      this.adminRepository.findAll('users'),
      this.adminRepository.findAll('credentials'),
    ]);

    const credentialById = new Map(credentials.map((c) => [c.id, c.data]));

    const userUpdates: { id: string; data: Record<string, any> }[] = [];
    const credentialUpdates: { id: string; data: Record<string, any> }[] = [];
    const missingCredentials: string[] = [];

    for (const user of users) {
      const credential = credentialById.get(user.id);
      const desired = this.desiredRole(user.data, credential);

      if (user.data.role !== desired) {
        userUpdates.push({ id: user.id, data: { role: desired } });
      }

      if (!credential) {
        missingCredentials.push(user.id);
      } else if (credential.role !== desired) {
        credentialUpdates.push({ id: user.id, data: { role: desired } });
      }
    }

    await this.adminRepository.mergeAll('users', userUpdates);
    await this.adminRepository.mergeAll('credentials', credentialUpdates);

    const agenda = await this.migrateAgendaSlots(users, credentialById);

    const report: MigrateRolesReport = {
      totalUsers: users.length,
      updatedUsers: userUpdates.length,
      updatedCredentials: credentialUpdates.length,
      missingCredentials,
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
