import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';

export interface RawDoc {
  id: string;
  data: Record<string, any>;
}

/** Acesso cru às coleções tocadas pelas rotinas de manutenção. */
@Injectable()
export class AdminRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async findAll(collection: string): Promise<RawDoc[]> {
    const snapshot = await this.db.collection(collection).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  }

  /** Reescreve documentos sob novos ids (novo docId) e apaga os antigos. */
  async moveAll(
    collection: string,
    moves: { fromId: string; toId: string; data: Record<string, any> }[],
  ): Promise<void> {
    const CHUNK = 200; // cada move gera 2 operações no lote
    for (let i = 0; i < moves.length; i += CHUNK) {
      const batch = this.db.batch();
      for (const move of moves.slice(i, i + CHUNK)) {
        batch.set(this.db.collection(collection).doc(move.toId), move.data);
        if (move.fromId !== move.toId) {
          batch.delete(this.db.collection(collection).doc(move.fromId));
        }
      }
      await batch.commit();
    }
  }

  /** Aplica um merge em cada documento, em lotes (limite do Firestore é 500). */
  async mergeAll(
    collection: string,
    updates: { id: string; data: Record<string, any> }[],
  ): Promise<void> {
    const CHUNK = 400;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const batch = this.db.batch();
      for (const update of updates.slice(i, i + CHUNK)) {
        batch.set(
          this.db.collection(collection).doc(update.id),
          update.data,
          { merge: true },
        );
      }
      await batch.commit();
    }
  }
}
