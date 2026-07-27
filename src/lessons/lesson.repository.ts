import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { Lesson } from './lesson.entity';

@Injectable()
export class LessonRepository {
  private readonly collection = 'lessons';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private get lessons() {
    return this.db.collection(this.collection);
  }

  private toEntity(id: string, data: Record<string, any>): Lesson {
    return new Lesson({ ...data, id });
  }

  private toPlain(lesson: Lesson): Record<string, any> {
    const plain: Record<string, any> = { ...lesson };
    delete plain.id;
    // Firestore rejeita `undefined`
    for (const key of Object.keys(plain)) {
      if (plain[key] === undefined) delete plain[key];
    }
    return plain;
  }

  async findById(id: string): Promise<Lesson | null> {
    const doc = await this.lessons.doc(id).get();
    return doc.exists ? this.toEntity(doc.id, doc.data()!) : null;
  }

  /**
   * Aulas num intervalo de datas (inclusivo). Filtrar por professora usa o
   * índice composto (teacherId, date) — ver README.
   */
  async findByRange(
    from: string,
    to: string,
    teacherId?: string,
  ): Promise<Lesson[]> {
    let query = this.lessons
      .where('date', '>=', from)
      .where('date', '<=', to) as FirebaseFirestore.Query;
    if (teacherId) {
      query = query.where('teacherId', '==', teacherId);
    }
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  async findByDate(date: string): Promise<Lesson[]> {
    const snapshot = await this.lessons.where('date', '==', date).get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  async findByStudent(
    studentId: string,
    from: string,
    to: string,
  ): Promise<Lesson[]> {
    const snapshot = await this.lessons
      .where('studentId', '==', studentId)
      .where('date', '>=', from)
      .where('date', '<=', to)
      .get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  async save(lesson: Lesson): Promise<void> {
    await this.lessons.doc(lesson.id).set(this.toPlain(lesson), { merge: true });
  }

  /** Cria em lote apenas as aulas que ainda não existem (materialização). */
  async createMissing(lessons: Lesson[]): Promise<number> {
    if (lessons.length === 0) return 0;

    const existing = await this.findExistingIds(lessons.map((l) => l.id));
    const missing = lessons.filter((lesson) => !existing.has(lesson.id));

    const CHUNK = 400;
    for (let i = 0; i < missing.length; i += CHUNK) {
      const batch = this.db.batch();
      for (const lesson of missing.slice(i, i + CHUNK)) {
        batch.set(this.lessons.doc(lesson.id), this.toPlain(lesson));
      }
      await batch.commit();
    }
    return missing.length;
  }

  private async findExistingIds(ids: string[]): Promise<Set<string>> {
    const found = new Set<string>();
    const CHUNK = 300; // limite prático do getAll
    for (let i = 0; i < ids.length; i += CHUNK) {
      const refs = ids.slice(i, i + CHUNK).map((id) => this.lessons.doc(id));
      const docs = await this.db.getAll(...refs);
      for (const doc of docs) {
        if (doc.exists) found.add(doc.id);
      }
    }
    return found;
  }
}
