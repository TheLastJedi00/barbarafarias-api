import { Injectable, Logger } from '@nestjs/common';
import { AdminRepository } from './admin.repository';
import { ROLES, Role, resolveRole } from '../types/role';

export interface MigrateRolesReport {
  totalUsers: number;
  updatedUsers: number;
  updatedCredentials: number;
  missingCredentials: string[];
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

    const report: MigrateRolesReport = {
      totalUsers: users.length,
      updatedUsers: userUpdates.length,
      updatedCredentials: credentialUpdates.length,
      missingCredentials,
    };
    this.logger.log(`Migração de papéis: ${JSON.stringify(report)}`);
    return report;
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
