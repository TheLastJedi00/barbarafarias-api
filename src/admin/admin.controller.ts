import { Body, Controller, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import {
  AdminService,
  MigratePlanTiersReport,
  MigrateRolesReport,
} from './admin.service';
import {
  AuthMigrationService,
  CleanupCredentialsReport,
  MigrateAuthReport,
} from './auth-migration.service';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';
import {
  ContractBackfillService,
  type BackfillReport,
} from '../contracts/contract-backfill.service';

class CleanupCredentialsDto {
  @IsOptional()
  @IsString()
  confirmar?: string;
}

@Controller('admin')
@Roles(ROLES.MANAGER)
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly migration: AuthMigrationService,
    private readonly contractBackfill: ContractBackfillService,
  ) {}

  /** Ação "Corrigir papéis dos usuários" do painel da gerente. */
  @Post('migrate-roles')
  migrateRoles(): Promise<MigrateRolesReport> {
    return this.service.migrateRoles();
  }

  /**
   * Marca todo aluno sem tier como Consultoria Particular Premium (spec 035
   * §7). Idempotente: rodar de novo só pega quem faltou.
   */
  @Post('migrate-plan-tiers')
  migratePlanTiers(): Promise<MigratePlanTiersReport> {
    return this.service.migratePlanTiers();
  }

  /**
   * Contratos em PDF dos aceites anteriores à spec 036 (§6), só os de texto
   * reconstruível com exatidão. Idempotente; devolve o que ficou de fora.
   */
  @Post('backfill-contracts')
  backfillContracts(): Promise<BackfillReport> {
    return this.contractBackfill.run();
  }

  /**
   * Cria no Firebase Auth quem já existe no Firestore (spec 016 Task 83).
   * Idempotente — pode ser chamada de novo sem medo.
   */
  @Post('migrate-auth')
  migrateAuth(): Promise<MigrateAuthReport> {
    return this.migration.migrateAuth();
  }

  /**
   * Apaga a coleção legada `credentials` (Task 84). **Sem corpo, só relata**;
   * apagar de verdade exige `{ "confirmar": "apagar-credentials" }`, porque é
   * a única operação irreversível desta spec.
   */
  @Post('cleanup-credentials')
  cleanupCredentials(
    @Body() body: CleanupCredentialsDto,
  ): Promise<CleanupCredentialsReport> {
    return this.migration.cleanupCredentials(body?.confirmar);
  }
}
