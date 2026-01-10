import { Teacher } from './teacher.model';

export interface TeacherRepository {
  findById(teacherId: string): Promise<Teacher | null>;
}
