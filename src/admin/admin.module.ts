import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminRepository } from './admin.repository';
import { AuthMigrationService } from './auth-migration.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminRepository, AuthMigrationService],
  exports: [AdminService],
})
export class AdminModule {}
