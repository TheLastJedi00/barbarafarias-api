import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { BrandIdentity, DEFAULT_IDENTITY_ID } from './brand-identity.model';

export const BRAND_IDENTITIES_COLLECTION = 'brandIdentities';

/** Código gRPC do Firestore para `create` em documento que já existe. */
const ALREADY_EXISTS = 6;

/** Identidades visuais da Campanha (spec 031). O id não é gravado no corpo. */
@Injectable()
export class BrandIdentityRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async list(): Promise<BrandIdentity[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs.map((doc) => toIdentity(doc.id, doc.data()));
  }

  async get(id: string): Promise<BrandIdentity | null> {
    const doc = await this.collection().doc(id).get();
    return doc.exists ? toIdentity(doc.id, doc.data()!) : null;
  }

  /**
   * Grava a padrão se ela ainda não existe e devolve a que estiver no banco.
   * `create` (e não `set`) nunca sobrescreve a padrão que a gerente editou, e
   * perde sem erro quando outra requisição gravou no mesmo instante.
   */
  async ensureDefault(seed: BrandIdentity): Promise<BrandIdentity> {
    const ref = this.collection().doc(DEFAULT_IDENTITY_ID);
    try {
      await ref.create(withoutId(seed));
      return seed;
    } catch (error) {
      if ((error as { code?: number }).code !== ALREADY_EXISTS) throw error;
      const doc = await ref.get();
      return toIdentity(doc.id, doc.data()!);
    }
  }

  async create(data: Omit<BrandIdentity, 'id'>): Promise<BrandIdentity> {
    const ref = this.collection().doc();
    await ref.set(data);
    return toIdentity(ref.id, data);
  }

  async save(identity: BrandIdentity): Promise<void> {
    await this.collection().doc(identity.id).set(withoutId(identity));
  }

  async delete(id: string): Promise<void> {
    await this.collection().doc(id).delete();
  }

  private collection() {
    return this.db.collection(BRAND_IDENTITIES_COLLECTION);
  }
}

function toIdentity(id: string, data: unknown): BrandIdentity {
  return { ...(data as Omit<BrandIdentity, 'id'>), id };
}

function withoutId(identity: BrandIdentity): Omit<BrandIdentity, 'id'> {
  const data: Partial<BrandIdentity> = { ...identity };
  delete data.id;
  return data as Omit<BrandIdentity, 'id'>;
}
