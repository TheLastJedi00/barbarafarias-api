import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { StudentFeedback } from './feedback.entity';

@Injectable()
export class FeedbackRepository {
  private readonly collection = 'student_feedbacks';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private get feedbacks() {
    return this.db.collection(this.collection);
  }

  async create(feedback: StudentFeedback): Promise<StudentFeedback> {
    const plain: Record<string, any> = { ...feedback };
    delete plain.id;
    for (const key of Object.keys(plain)) {
      if (plain[key] === undefined) delete plain[key];
    }
    const ref = await this.feedbacks.add(plain);
    return new StudentFeedback({ ...feedback, id: ref.id });
  }

  /** Histórico do aluno, do mais recente para o mais antigo. */
  async findByStudent(studentId: string): Promise<StudentFeedback[]> {
    const snapshot = await this.feedbacks
      .where('studentId', '==', studentId)
      .get();
    return snapshot.docs
      .map((doc) => new StudentFeedback({ ...doc.data(), id: doc.id }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }
}
