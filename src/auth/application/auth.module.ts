import { Module } from '@nestjs/common';
import { FirebaseAuthGuard } from '../infrastructure/firebase.guard';
import { RolesGuard } from '../infrastructure/roles.guard';
import { UserModule } from 'src/users/application/user.module';
import { TeacherModule } from 'src/teacher/application/teacher.module';

@Module({
  providers: [
    FirebaseAuthGuard,
    RolesGuard,
    
  ],
  exports: [FirebaseAuthGuard, RolesGuard],
  controllers: [],
  imports: [
    UserModule,
    TeacherModule,
  ],
})
export class AuthModule {}
