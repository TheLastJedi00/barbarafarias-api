import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { APPLICATIONS_COLLECTION } from './recruitment.collections';
import { Application } from './application.model';

/**
 * Coleção `applications` (spec 028), consultada por `jobId` ou por
 * `candidateId` — um campo só, sem índice composto.
 */
@Injectable()
export class ApplicationRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async findById(id: string): Promise<Application | null> {
    const doc = await this.collection().doc(id).get();
    return doc.exists ? this.toEntity(doc.id, doc.data()!) : null;
  }

  async findAll(): Promise<Application[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  async findByJob(jobId: string): Promise<Application[]> {
    return this.findBy('jobId', jobId);
  }

  async findByCandidate(candidateId: string): Promise<Application[]> {
    return this.findBy('candidateId', candidateId);
  }

  async save(application: Application): Promise<void> {
    const { id, ...data } = application;
    await this.collection()
      .doc(id)
      .set(JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
  }

  async delete(id: string): Promise<void> {
    await this.collection().doc(id).delete();
  }

  /** Apaga várias de uma vez (vaga excluída, exclusão LGPD). */
  async deleteMany(ids: string[]): Promise<void> {
    // O batch do Firestore aceita até 500 escritas.
    for (let i = 0; i < ids.length; i += 500) {
      const batch = this.db.batch();
      for (const id of ids.slice(i, i + 500)) {
        batch.delete(this.collection().doc(id));
      }
      await batch.commit();
    }
  }

  private async findBy(
    field: 'jobId' | 'candidateId',
    value: string,
  ): Promise<Application[]> {
    const snapshot = await this.collection().where(field, '==', value).get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  private collection() {
    return this.db.collection(APPLICATIONS_COLLECTION);
  }

  private toEntity(id: string, data: Record<string, any>): Application {
    return {
      id,
      jobId: data.jobId ?? '',
      candidateId: data.candidateId ?? '',
      status: data.status ?? 'received',
      createdAt: data.createdAt ?? '',
      updatedAt: data.updatedAt ?? data.createdAt ?? '',
    };
  }
}
