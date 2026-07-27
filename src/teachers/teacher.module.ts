import { Module } from '@nestjs/common';
import { TeacherController } from './teacher.controller';
import { TeacherService } from './teacher.service';
import { TeacherRepository } from './teacher.repository';
import { UserModule } from '../users/user.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [UserModule, AuthModule, NotificationModule],
  controllers: [TeacherController],
  providers: [TeacherService, TeacherRepository],
  exports: [TeacherService, TeacherRepository],
})
export class TeacherModule {}
