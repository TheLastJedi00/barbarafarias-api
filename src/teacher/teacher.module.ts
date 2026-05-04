import { Module } from '@nestjs/common';
import { TeacherService } from './teacher.service';
import { TeacherRepository } from './teacher.repository';

@Module({
  imports: [],
  controllers: [],
  providers: [
    TeacherService,
    {
      provide: 'TeacherRepository',
      useClass: TeacherRepository,
    },
  ],
  exports: [TeacherService],
})
export class TeacherModule {}
