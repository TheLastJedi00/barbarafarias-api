import { forwardRef, Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserFirestoreRepository } from '../infrastructure/user.repository';
import { UserService } from './user.service';
import { IsEmailUnique } from '../infrastructure/validators/IsEmailUnique.constraint';
import { AuthModule } from '../../auth/application/auth.module';
import { TeacherModule } from '../../teacher/application/teacher.module';

@Module({
  imports: [ 
    forwardRef(() => AuthModule),
    TeacherModule
  ],
  controllers: [UserController],
  providers: [
    UserService,
    {
      provide: 'UserRepository',
      useClass: UserFirestoreRepository,
    },
    IsEmailUnique,
  ],
  exports: ['UserRepository', UserService],
})
export class UserModule {}
