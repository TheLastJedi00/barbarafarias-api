import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminRepository } from './admin.repository';
import { AuthMigrationService } from './auth-migration.service';
import { ContractBackfillService } from '../contracts/contract-backfill.service';
import { ContractModule } from '../contracts/contract.module';
import { SubscriptionModule } from '../subscriptions/subscription.module';
import { StoreModule } from '../store/store.module';
import { UserModule } from '../users/user.module';
import { LegalModule } from '../legal/legal.module';

@Module({
  imports: [
    ContractModule,
    SubscriptionModule,
    StoreModule,
    UserModule,
    LegalModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminRepository,
    AuthMigrationService,
    ContractBackfillService,
  ],
  exports: [AdminService],
})
export class AdminModule {}
