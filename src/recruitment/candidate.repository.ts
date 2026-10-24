import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { CANDIDATES_COLLECTION } from './recruitment.collections';

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

  private collection() {
    return this.db.collection(CANDIDATES_COLLECTION);
  }
}
