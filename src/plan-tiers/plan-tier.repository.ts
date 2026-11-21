import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import {
  DEFAULT_TIERS,
  PLAN_TIER_ID_LIST,
  isPlanTierId,
  type PlanTier,
  type PlanTierId,
} from './plan-tier.model';

export const PLAN_TIERS_COLLECTION = 'planTiers';
/** Subcoleção de cada tier: os preços que entraram em vigor, com a data. */
export const PRICE_HISTORY_SUBCOLLECTION = 'priceHistory';

/** Código gRPC do Firestore para `create` em documento que já existe. */
const ALREADY_EXISTS = 6;

export interface PriceHistoryEntry {
  packagePrice: number | null;
  monthlyPrice: number | null;
  enrollmentFee?: number | null;
  effectiveAt: string;
  requestedBy: string;
  appliedAt: string;
}

/** Os três tiers de plano (spec 035). O id é a chave do documento. */
@Injectable()
export class PlanTierRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /**
   * Os três tiers, semeando o que faltar. `create` (e não `set`) nunca
   * sobrescreve o que a gerente editou e perde sem erro quando outra
   * requisição semeou no mesmo instante — o padrão do `brandIdentities`.
   */
  async listAll(): Promise<PlanTier[]> {
    const snapshot = await this.collection().get();
    const found = new Map<string, PlanTier>();
    for (const doc of snapshot.docs) {
      if (isPlanTierId(doc.id)) found.set(doc.id, toTier(doc.id, doc.data()));
    }

    for (const id of PLAN_TIER_ID_LIST) {
      if (!found.has(id)) found.set(id, await this.seed(id));
    }
    return PLAN_TIER_ID_LIST.map((id) => found.get(id)!);
  }

  async get(id: PlanTierId): Promise<PlanTier> {
    const doc = await this.collection().doc(id).get();
    return doc.exists ? toTier(id, doc.data()!) : this.seed(id);
  }

  async save(tier: PlanTier): Promise<void> {
    await this.collection().doc(tier.id).set(withoutId(tier));
  }

  async addHistory(id: PlanTierId, entry: PriceHistoryEntry): Promise<void> {
    await this.collection()
      .doc(id)
      .collection(PRICE_HISTORY_SUBCOLLECTION)
      .add(entry);
  }

  private async seed(id: PlanTierId): Promise<PlanTier> {
    const ref = this.collection().doc(id);
    const seed = DEFAULT_TIERS[id];
    try {
      await ref.create(withoutId(seed));
      return { ...seed, benefits: [...seed.benefits] };
    } catch (error) {
      if ((error as { code?: number }).code !== ALREADY_EXISTS) throw error;
      const doc = await ref.get();
      return toTier(id, doc.data()!);
    }
  }

  private collection() {
    return this.db.collection(PLAN_TIERS_COLLECTION);
  }
}

function toTier(id: PlanTierId, data: Record<string, any>): PlanTier {
  const seed = DEFAULT_TIERS[id];
  return {
    id,
    name: data.name ?? seed.name,
    description: data.description ?? seed.description,
    benefits: Array.isArray(data.benefits) ? data.benefits : [...seed.benefits],
    packagePrice: data.packagePrice ?? null,
    monthlyPrice: data.monthlyPrice ?? null,
    enrollmentFee: data.enrollmentFee ?? null,
    active: data.active ?? false,
    pending: data.pending ?? null,
    updatedAt: data.updatedAt ?? '',
    updatedBy: data.updatedBy ?? '',
  };
}

function withoutId(tier: PlanTier): Omit<PlanTier, 'id'> {
  const data: Partial<PlanTier> = { ...tier, pending: tier.pending ?? null };
  delete data.id;
  return data as Omit<PlanTier, 'id'>;
}
