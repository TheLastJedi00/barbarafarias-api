import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import type { Module, Topic } from '../types/student.supply';
import {
  STORE_SUPPLIES_COLLECTION,
  STORE_SUPPLY_MODULES_COLLECTION,
} from './store.collections';
import {
  StoreSupply,
  StoreSupplyContent,
  storeSupplyContentId,
} from './store-supply.model';

/** Firestore recusa `undefined`; o JSON tira os campos ausentes. */
function clean<T>(data: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
}

/**
 * Coleções `storeSupplies` (cabeçalho) e `storeSupplyModules` (conteúdo por
 * geração) da spec 033.
 */
@Injectable()
export class StoreSupplyRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async findById(id: string): Promise<StoreSupply | null> {
    const doc = await this.headers().doc(id).get();
    return doc.exists ? this.toEntity(doc.id, doc.data()!) : null;
  }

  async findAll(): Promise<StoreSupply[]> {
    const snapshot = await this.headers().get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  /**
   * Lê e grava o cabeçalho numa transação. É o que impede duas abas de gastar
   * a mesma chance ou de passar juntas do teto de tentativas.
   */
  transact<T>(
    id: string,
    fn: (current: StoreSupply | null) => { write?: StoreSupply; result: T },
  ): Promise<T> {
    return this.db.runTransaction(async (tx) => {
      const ref = this.headers().doc(id);
      const snapshot = await tx.get(ref);
      const current = snapshot.exists
        ? this.toEntity(snapshot.id, snapshot.data()!)
        : null;
      const { write, result } = fn(current);
      if (write) {
        const data: Partial<StoreSupply> = { ...write };
        delete data.id;
        tx.set(ref, clean(data));
      }
      return result;
    });
  }

  async findContent(
    id: string,
    generation: number,
  ): Promise<StoreSupplyContent | null> {
    const doc = await this.contents()
      .doc(storeSupplyContentId(id, generation))
      .get();
    return doc.exists ? (doc.data() as StoreSupplyContent) : null;
  }

  async saveStepContent(
    id: string,
    generation: number,
    stepId: string,
    content: string | Topic,
  ): Promise<void> {
    await this.contents()
      .doc(storeSupplyContentId(id, generation))
      .set(clean({ supplyId: id, generation, steps: { [stepId]: content } }), {
        merge: true,
      });
  }

  /**
   * Fim de uma geração: grava o módulo montado, aponta o cabeçalho para ele e
   * apaga a geração anterior — tudo num lote só, então a pessoa nunca fica sem
   * material nem com dois.
   */
  async finish(
    supply: StoreSupply,
    generation: number,
    module: Module,
    previous?: number,
  ): Promise<void> {
    const batch = this.db.batch();
    batch.set(
      this.contents().doc(storeSupplyContentId(supply.id, generation)),
      clean({ module }),
      { merge: true },
    );
    const { id, ...header } = supply;
    batch.set(this.headers().doc(id), clean(header));
    if (previous !== undefined && previous !== generation) {
      batch.delete(this.contents().doc(storeSupplyContentId(id, previous)));
    }
    await batch.commit();
  }

  /** Apaga o material inteiro: cabeçalho e todas as gerações. */
  async delete(id: string): Promise<void> {
    const snapshot = await this.contents().where('supplyId', '==', id).get();
    const batch = this.db.batch();
    for (const doc of snapshot.docs) batch.delete(doc.ref);
    batch.delete(this.headers().doc(id));
    await batch.commit();
  }

  private headers() {
    return this.db.collection(STORE_SUPPLIES_COLLECTION);
  }

  private contents() {
    return this.db.collection(STORE_SUPPLY_MODULES_COLLECTION);
  }

  private toEntity(id: string, data: Record<string, any>): StoreSupply {
    return {
      id,
      userId: data.userId,
      productId: data.productId,
      level: data.level,
      moduleId: data.moduleId,
      chances: {
        purchaseId: data.chances?.purchaseId ?? '',
        used: data.chances?.used ?? 0,
        ...(data.chances?.lastStartedAt
          ? { lastStartedAt: data.chances.lastStartedAt }
          : {}),
      },
      lastGeneration: data.lastGeneration ?? 0,
      ...(data.current ? { current: data.current } : {}),
      ...(data.pending ? { pending: data.pending } : {}),
      createdAt: data.createdAt ?? '',
      updatedAt: data.updatedAt ?? data.createdAt ?? '',
    };
  }
}
