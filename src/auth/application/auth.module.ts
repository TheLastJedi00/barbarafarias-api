import { forwardRef, Module } from '@nestjs/common';
import { FirebaseAuthGuard } from '../infrastructure/firebase.guard';
import { RolesGuard } from '../infrastructure/roles.guard';
import { UserModule } from '../..//users/application/user.module';
import { TeacherModule } from '../../teacher/application/teacher.module';

@Module({
  providers: [
    FirebaseAuthGuard,
    RolesGuard,
  ],
  exports: [FirebaseAuthGuard, RolesGuard],
  controllers: [],
  imports: [
    forwardRef(() => UserModule),
    TeacherModule,
  ],
})
export class AuthModule {}
