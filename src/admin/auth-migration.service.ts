import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Auth } from 'firebase-admin/auth';
import { AdminRepository } from './admin.repository';
import { FIREBASE_AUTH } from '../firestore/firebase-auth.module';
import { ROLES, Role, resolveRole } from '../types/role';

export interface MigrateAuthReport {
  totalUsers: number;
  criados: number;
  jaExistentes: number;
  /** `uid`s sem e-mail em `users` nem em `credentials`: nada a criar. */
  semEmail: string[];
  /** E-mails que já pertencem a **outra** conta — exigem decisão humana. */
  emailDuplicado: { uid: string; email: string }[];
  erros: { uid: string; motivo: string }[];
}

export interface CleanupCredentialsReport {
  total: number;
  /** Documentos cujo `uid` já tem conta no Firebase. */
  comConta: number;
  /** Documentos sem conta correspondente — impedem a limpeza. */
  semConta: string[];
  apagados: number;
}

/** Frase exigida no corpo para a limpeza acontecer de fato. */
export const CLEANUP_CONFIRMATION = 'apagar-credentials';

/**
 * Migração da base para o Firebase Auth (spec 016 Fase 4).
 *
 * É rota, e não script solto, pelo mesmo motivo do `migrate-roles`: roda com
 * as credenciais do ambiente, sem ninguém baixar a service account de produção
 * na própria máquina.
 */
@Injectable()
export class AuthMigrationService {
  private readonly logger = new Logger(AuthMigrationService.name);

  constructor(
    private readonly adminRepository: AdminRepository,
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
  ) {}

  /**
   * Cria no Firebase quem já existe no Firestore (Task 83).
   *
   * **Idempotente por construção:** `getUser` antes de tudo, e a conta que já
   * existe só tem a claim conferida. A rota vai ser chamada mais de uma vez —
   * em dev, em staging, em produção, e de novo quando algo falhar no meio.
   *
   * A senha é aleatória e **nunca** é gravada nem devolvida: o caminho de volta
   * de cada pessoa é o "Esqueci minha senha", e concluí-lo já marca o e-mail
   * como verificado no Firebase.
   */
  async migrateAuth(): Promise<MigrateAuthReport> {
    const [users, credentials] = await Promise.all([
      this.adminRepository.findAll('users'),
      this.adminRepository.findAll('credentials'),
    ]);
    const credentialById = new Map(credentials.map((c) => [c.id, c.data]));

    const report: MigrateAuthReport = {
      totalUsers: users.length,
      criados: 0,
      jaExistentes: 0,
      semEmail: [],
      emailDuplicado: [],
      erros: [],
    };

    for (const user of users) {
      const email = user.data.email ?? credentialById.get(user.id)?.email;
      const role = this.desiredRole(user.data, credentialById.get(user.id));

      if (!email) {
        report.semEmail.push(user.id);
        continue;
      }

      try {
        if (await this.accountExists(user.id)) {
          await this.auth.setCustomUserClaims(user.id, { role });
          report.jaExistentes += 1;
          continue;
        }

        await this.auth.createUser({
          uid: user.id,
          email,
          password: randomBytes(32).toString('hex'),
        });
        await this.auth.setCustomUserClaims(user.id, { role });
        report.criados += 1;
      } catch (error: any) {
        if (error?.code === 'auth/email-already-exists') {
          // Duas fichas com o mesmo e-mail: a coleção `credentials` aceitava,
          // o Firebase não. Escolher uma automaticamente arriscaria dar a
          // conta de alguém para outra pessoa — isto é decisão humana.
          report.emailDuplicado.push({ uid: user.id, email });
          continue;
        }
        report.erros.push({ uid: user.id, motivo: String(error?.message ?? error) });
      }
    }

    this.logger.log(`Migração de contas: ${JSON.stringify(report)}`);
    return report;
  }

  /**
   * Apaga a coleção legada `credentials` (Task 84).
   *
   * Sem confirmação, só **relata** — é a única operação irreversível da spec, e
   * o relatório é justamente o que torna a exclusão segura. Se algum documento
   * não tiver conta correspondente no Firebase, a limpeza é recusada: apagar o
   * registro de quem ainda não migrou destruiria a única pista de como
   * consertar.
   */
  async cleanupCredentials(
    confirmacao?: string,
  ): Promise<CleanupCredentialsReport> {
    const credentials = await this.adminRepository.findAll('credentials');

    const semConta: string[] = [];
    for (const credential of credentials) {
      if (!(await this.accountExists(credential.id))) {
        semConta.push(credential.id);
      }
    }

    const report: CleanupCredentialsReport = {
      total: credentials.length,
      comConta: credentials.length - semConta.length,
      semConta,
      apagados: 0,
    };

    if (confirmacao !== CLEANUP_CONFIRMATION) {
      return report;
    }
    if (semConta.length > 0) {
      throw new ConflictException(
        `Limpeza recusada: ${semConta.length} credenciais sem conta no Firebase. Rode /admin/migrate-auth antes.`,
      );
    }

    await this.adminRepository.deleteAll(
      'credentials',
      credentials.map((c) => c.id),
    );
    report.apagados = credentials.length;
    this.logger.warn(`Coleção credentials apagada: ${report.apagados} documentos.`);
    return report;
  }

  private async accountExists(uid: string): Promise<boolean> {
    try {
      await this.auth.getUser(uid);
      return true;
    } catch (error: any) {
      if (error?.code === 'auth/user-not-found') {
        return false;
      }
      throw error;
    }
  }

  /** Mesma precedência do `migrate-roles`, enquanto a coleção legada existir. */
  private desiredRole(
    user: Record<string, any>,
    credential?: Record<string, any>,
  ): Role {
    const known: string[] = Object.values(ROLES);
    if (user.role && known.includes(user.role)) {
      return user.role as Role;
    }
    if (credential?.role && known.includes(credential.role)) {
      return credential.role as Role;
    }
    return resolveRole({ isTeacher: user.isTeacher });
  }
}
