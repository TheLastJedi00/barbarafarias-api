import { forwardRef, Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { AuthModule } from '../auth/application/auth.module';
import { TeacherModule } from '../teacher/application/teacher.module';

@Module({
  imports: [forwardRef(() => AuthModule), TeacherModule],
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService],
})
export class UserModule {}
