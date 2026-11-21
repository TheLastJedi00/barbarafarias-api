import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { Enrollment } from './enrollment.model';

const ENROLLMENTS_COLLECTION = 'enrollments';

/** Coleção `enrollments` (spec 036). Uma consulta, um campo. */
@Injectable()
export class EnrollmentRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  newId(): string {
    return this.collection().doc().id;
  }

  async findById(id: string): Promise<Enrollment | null> {
    const doc = await this.collection().doc(id).get();
    return doc.exists ? toEntity(doc.id, doc.data()!) : null;
  }

  findByStudent(studentId: string): Promise<Enrollment[]> {
    return this.findBy('studentId', studentId);
  }

  findByTurma(turmaId: string): Promise<Enrollment[]> {
    return this.findBy('turmaId', turmaId);
  }

  /** Para o webhook: a order do Mercado Pago aponta para uma matrícula só. */
  async findByOrderId(orderId: string): Promise<Enrollment | null> {
    const snapshot = await this.collection()
      .where('gateway.orderId', '==', orderId)
      .limit(1)
      .get();
    const doc = snapshot.docs[0];
    return doc ? toEntity(doc.id, doc.data()) : null;
  }

  async save(enrollment: Enrollment): Promise<Enrollment> {
    const { id, ...data } = enrollment;
    // O stringify tira os `undefined`, que o Firestore recusa.
    await this.collection()
      .doc(id)
      .set(JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
    return enrollment;
  }

  private async findBy(field: string, value: string): Promise<Enrollment[]> {
    const snapshot = await this.collection().where(field, '==', value).get();
    return snapshot.docs
      .map((doc) => toEntity(doc.id, doc.data()))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private collection() {
    return this.db.collection(ENROLLMENTS_COLLECTION);
  }
}

function toEntity(id: string, data: Record<string, unknown>): Enrollment {
  return {
    ...(data as Omit<Enrollment, 'id'>),
    id,
    gateway: (data.gateway as Enrollment['gateway']) ?? {},
  };
}
