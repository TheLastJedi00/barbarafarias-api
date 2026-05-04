import { NotFoundError } from 'rxjs';
import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Teacher } from './teacher.entity';

@Injectable()
export class TeacherRepository implements TeacherRepository {
  private readonly db: Firestore;
  private readonly collectionName = 'teachers';
  constructor() {
    this.db = admin.firestore();
  }

  async findById(teacherId: string): Promise<Teacher | null> {
    console.log('Searching for Teacher ID:', teacherId);
    try {
      const doc = await this.db
        .collection(this.collectionName)
        .doc(teacherId)
        .get();
      if (!doc.exists) {
        throw new NotFoundException('Teacher not found');
      }
      const data = doc.data();
      const teacher = new Teacher(data!.fullName, data!.email, data!.isTeacher);
      return teacher;
    } catch (error) {
      console.error('Error fetching teacher by ID:', error);
      throw error;
    }
  }
}
