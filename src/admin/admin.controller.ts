import { Controller, Post } from '@nestjs/common';
import { AdminService, MigrateRolesReport } from './admin.service';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';

@Controller('admin')
@Roles(ROLES.MANAGER)
export class AdminController {
  constructor(private readonly service: AdminService) {}

  /** Ação "Corrigir papéis dos usuários" do painel da gerente. */
  @Post('migrate-roles')
  migrateRoles(): Promise<MigrateRolesReport> {
    return this.service.migrateRoles();
  }
}
