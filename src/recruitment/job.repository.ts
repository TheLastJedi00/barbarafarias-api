import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { JOBS_COLLECTION } from './recruitment.collections';
import { Job, JobStatus } from './job.model';

/**
 * Coleção `jobs` (spec 028). Consultas de um campo só, ordenação em memória:
 * a escola tem poucas vagas.
 */
@Injectable()
export class JobRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  newId(): string {
    return this.collection().doc().id;
  }

  async findById(id: string): Promise<Job | null> {
    const doc = await this.collection().doc(id).get();
    return doc.exists ? this.toEntity(doc.id, doc.data()!) : null;
  }

  async findAll(): Promise<Job[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  async findByStatus(status: JobStatus): Promise<Job[]> {
    const snapshot = await this.collection()
      .where('status', '==', status)
      .get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  async save(job: Job): Promise<void> {
    const { id, ...data } = job;
    // JSON round-trip: o Firestore recusa `undefined` nos opcionais.
    await this.collection()
      .doc(id)
      .set(JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
  }

  async delete(id: string): Promise<void> {
    await this.collection().doc(id).delete();
  }

  private collection() {
    return this.db.collection(JOBS_COLLECTION);
  }

  private toEntity(id: string, data: Record<string, any>): Job {
    return {
      id,
      title: data.title ?? '',
      description: data.description ?? '',
      ...(data.requirements ? { requirements: data.requirements } : {}),
      ...(data.modality ? { modality: data.modality } : {}),
      ...(data.workload ? { workload: data.workload } : {}),
      status: data.status === 'open' ? 'open' : 'closed',
      createdBy: data.createdBy ?? '',
      createdAt: data.createdAt ?? '',
      updatedAt: data.updatedAt ?? data.createdAt ?? '',
    };
  }
}
