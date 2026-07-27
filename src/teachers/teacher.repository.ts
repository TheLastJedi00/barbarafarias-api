import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { plainToInstance } from 'class-transformer';
import { User } from '../users/user.entity';
import { ROLES } from '../types/role';

/**
 * Acesso à coleção `users` com recorte de professoras (manager/teacher).
 * Durante a migração de `isTeacher` → `role` (spec 010 §2.1) a listagem une as
 * duas fontes: documentos já migrados (`role`) e legados (`isTeacher`).
 */
@Injectable()
export class TeacherRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private get users() {
    return this.db.collection('users');
  }

  async findAllStaff(): Promise<User[]> {
    const [byRole, legacy] = await Promise.all([
      this.users.where('role', 'in', [ROLES.MANAGER, ROLES.TEACHER]).get(),
      this.users.where('isTeacher', '==', true).get(),
    ]);

    const byId = new Map<string, User>();
    for (const doc of [...byRole.docs, ...legacy.docs]) {
      byId.set(doc.id, plainToInstance(User, { ...doc.data(), id: doc.id }));
    }
    return [...byId.values()];
  }

  async findStudentsByTeacher(teacherId: string): Promise<User[]> {
    const snapshot = await this.users
      .where('teacherId', '==', teacherId)
      .get();
    return snapshot.docs.map((doc) =>
      plainToInstance(User, { ...doc.data(), id: doc.id }),
    );
  }

  /** Marca os alunos da professora como pendentes de realocação. Devolve quantos. */
  async markStudentsPendingTeacher(teacherId: string): Promise<number> {
    const students = await this.findStudentsByTeacher(teacherId);
    if (students.length === 0) {
      return 0;
    }
    const batch = this.db.batch();
    for (const student of students) {
      batch.set(
        this.users.doc(student.id!),
        { pendingTeacher: true },
        { merge: true },
      );
    }
    await batch.commit();
    return students.length;
  }
}
