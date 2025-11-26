import { Inject, Injectable } from "@nestjs/common";
import { Teacher } from "../domain/teacher.model";
import type { TeacherRepository } from "../domain/teacherRepository.port";

@Injectable()
export class TeacherService {
    constructor(
        @Inject('TeacherRepository')
        private readonly teacherRepository: TeacherRepository
    ) {}

    async findTeacherById(teacherId: string): Promise<Teacher | null> {
        return this.teacherRepository.findById(teacherId);
    }

}