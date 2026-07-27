import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ResendService } from './resend.service';
import { NotificationService } from './notification.service';
import { UserModule } from '../users/user.module';

@Module({
  imports: [ConfigModule, UserModule],
  providers: [ResendService, NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
