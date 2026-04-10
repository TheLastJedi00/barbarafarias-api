import { Module } from '@nestjs/common';
import { TeacherService } from './teacher.service';
import { TeacherFirebaseRepository } from '../infrastructure/teacherRepository';

@Module({
  imports: [],
  controllers: [],
  providers: [
    TeacherService,
    {
      provide: 'TeacherRepository',
      useClass: TeacherFirebaseRepository,
    },
  ],
  exports: [TeacherService],
})
export class TeacherModule {}
