import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import {
  RESCHEDULE_STATUS,
  RescheduleRequest,
  RescheduleStatus,
} from './reschedule.entity';

@Injectable()
export class RescheduleRepository {
  private readonly collection = 'reschedule_requests';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private get requests() {
    return this.db.collection(this.collection);
  }

  private toEntity(id: string, data: Record<string, any>): RescheduleRequest {
    return new RescheduleRequest({ ...data, id });
  }

  private toPlain(request: RescheduleRequest): Record<string, any> {
    const plain: Record<string, any> = { ...request };
    delete plain.id;
    for (const key of Object.keys(plain)) {
      if (plain[key] === undefined) delete plain[key];
    }
    return plain;
  }

  async create(request: RescheduleRequest): Promise<RescheduleRequest> {
    const ref = await this.requests.add(this.toPlain(request));
    return new RescheduleRequest({ ...request, id: ref.id });
  }

  async save(request: RescheduleRequest): Promise<void> {
    await this.requests
      .doc(request.id)
      .set(this.toPlain(request), { merge: true });
  }

  async findById(id: string): Promise<RescheduleRequest | null> {
    const doc = await this.requests.doc(id).get();
    return doc.exists ? this.toEntity(doc.id, doc.data()!) : null;
  }

  async findByStatus(status: RescheduleStatus): Promise<RescheduleRequest[]> {
    const snapshot = await this.requests.where('status', '==', status).get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  async findByTeacher(teacherId: string): Promise<RescheduleRequest[]> {
    const snapshot = await this.requests
      .where('teacherId', '==', teacherId)
      .get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  /** Solicitação pendente da aula — evita duas filas para a mesma aula. */
  async findPendingByLesson(
    lessonId: string,
  ): Promise<RescheduleRequest | null> {
    const snapshot = await this.requests
      .where('lessonId', '==', lessonId)
      .where('status', '==', RESCHEDULE_STATUS.PENDING)
      .limit(1)
      .get();
    return snapshot.empty
      ? null
      : this.toEntity(snapshot.docs[0].id, snapshot.docs[0].data());
  }
}
