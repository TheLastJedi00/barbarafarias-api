import { Inject, Injectable } from "@nestjs/common";
import { Teacher } from "../domain/teacher.model";
import type { TeacherRepository } from "../domain/teacherRepository.port";

@Injectable()
export class TeacherService {
    constructor(
        @Inject('TeacherRepository')
        private readonly teacherRepository: TeacherRepository
    ) {}

    async findTeacherById(teacherId: string): Promise<Teacher> {
        const teacher = await this.teacherRepository.findById(teacherId);
        if (!teacher) {
            throw new Error('Teacher not found');
        }
        return teacher;
    }

}