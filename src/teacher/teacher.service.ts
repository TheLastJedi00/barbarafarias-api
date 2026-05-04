import { Injectable } from '@nestjs/common';
import { Teacher } from './entities/teacher.entity';
import { TeacherRepository } from './teacher.repository';

@Injectable()
export class TeacherService {
  constructor(
    private readonly teacherRepository: TeacherRepository,
  ) {}

  async findTeacherById(teacherId: string): Promise<Teacher> {
    const teacher = await this.teacherRepository.findById(teacherId);
    if (!teacher) {
      throw new Error('Teacher not found');
    }
    return teacher;
  }
}
