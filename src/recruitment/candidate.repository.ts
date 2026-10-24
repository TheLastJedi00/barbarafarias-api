import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { CANDIDATES_COLLECTION } from './recruitment.collections';
import { Candidate } from './candidate.model';

/**
 * Coleção `candidates`, um doc por conta de candidato, com id = uid (spec 028).
 *
 * Fica **fora de `users`** de propósito: a listagem da professora devolve todo
 * não-aluno de `users`, e o candidato apareceria ali.
 */
@Injectable()
export class CandidateRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /** Usado pelo `AuthService` para não resolver um candidato como aluno. */
  async exists(id: string): Promise<boolean> {
    const doc = await this.collection().doc(id).get();
    return doc.exists;
  }

  async findById(id: string): Promise<Candidate | null> {
    const doc = await this.collection().doc(id).get();
    return doc.exists ? this.toEntity(doc.id, doc.data()!) : null;
  }

  /** Banco de talentos: a escola tem dezenas de candidatos, não milhares. */
  async findAll(): Promise<Candidate[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  async save(candidate: Candidate): Promise<void> {
    const { id, ...data } = candidate;
    // JSON round-trip: o Firestore recusa `undefined`, e `set` sem merge faz
    // um opcional removido (linkedin, pendingResume) sumir de verdade.
    await this.collection()
      .doc(id)
      .set(JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
  }

  async delete(id: string): Promise<void> {
    await this.collection().doc(id).delete();
  }

  private collection() {
    return this.db.collection(CANDIDATES_COLLECTION);
  }

  private toEntity(id: string, data: Record<string, any>): Candidate {
    return {
      id,
      email: data.email ?? '',
      name: data.name ?? '',
      phone: data.phone ?? '',
      ...(data.linkedinUrl ? { linkedinUrl: data.linkedinUrl } : {}),
      ...(data.resume ? { resume: data.resume } : {}),
      ...(data.pendingResume ? { pendingResume: data.pendingResume } : {}),
      consentAt: data.consentAt ?? '',
      consentVersion: data.consentVersion ?? '',
      createdAt: data.createdAt ?? '',
      updatedAt: data.updatedAt ?? data.createdAt ?? '',
    };
  }
}
