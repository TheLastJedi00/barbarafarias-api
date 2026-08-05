import { Body, Controller, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { AdminService, MigrateRolesReport } from './admin.service';
import {
  AuthMigrationService,
  CleanupCredentialsReport,
  MigrateAuthReport,
} from './auth-migration.service';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';

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
  ) {}

  /** Ação "Corrigir papéis dos usuários" do painel da gerente. */
  @Post('migrate-roles')
  migrateRoles(): Promise<MigrateRolesReport> {
    return this.service.migrateRoles();
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
