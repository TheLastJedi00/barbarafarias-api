import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { AuthModule } from '../auth/auth.module';
import { ManualPaymentModule } from '../manual-payments/manual-payment.module';

@Module({
  imports: [AuthModule, ManualPaymentModule],
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService, UserRepository],
})
export class UserModule {}
