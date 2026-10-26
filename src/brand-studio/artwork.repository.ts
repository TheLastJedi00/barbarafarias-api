import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { Artwork } from './artwork.model';

export const ARTWORKS_COLLECTION = 'artworks';

/** Histórico de artes da Campanha (spec 031 §3). O id não é gravado no corpo. */
@Injectable()
export class ArtworkRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async create(data: Omit<Artwork, 'id'>): Promise<Artwork> {
    const ref = this.collection().doc();
    await ref.set(data);
    return { ...data, id: ref.id };
  }

  async get(id: string): Promise<Artwork | null> {
    const doc = await this.collection().doc(id).get();
    return doc.exists ? toArtwork(doc.id, doc.data()) : null;
  }

  async save(artwork: Artwork): Promise<void> {
    const data: Partial<Artwork> = { ...artwork };
    delete data.id;
    await this.collection().doc(artwork.id).set(data);
  }

  async delete(id: string): Promise<void> {
    await this.collection().doc(id).delete();
  }

  /** Mais recentes primeiro; `before` é o `createdAt` do último item da página anterior. */
  async list(limit = 20, before?: string): Promise<Artwork[]> {
    let query = this.collection().orderBy('createdAt', 'desc');
    if (before) query = query.startAfter(before);
    const snapshot = await query.limit(limit).get();
    return snapshot.docs.map((doc) => toArtwork(doc.id, doc.data()));
  }

  private collection() {
    return this.db.collection(ARTWORKS_COLLECTION);
  }
}

function toArtwork(id: string, data: unknown): Artwork {
  return { ...(data as Omit<Artwork, 'id'>), id };
}
