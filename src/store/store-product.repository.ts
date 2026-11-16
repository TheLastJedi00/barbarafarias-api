import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { STORE_PRODUCTS_COLLECTION } from './store.collections';
import { STORE_MAX_INSTALLMENTS, StoreProduct } from './store-product.model';

/**
 * Coleção `storeProducts` (spec 032). Consultas por **um campo só** — o projeto
 * não publica índice composto — e ordenação em memória: a vitrine tem dezenas
 * de produtos.
 */
@Injectable()
export class StoreProductRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  newId(): string {
    return this.collection().doc().id;
  }

  async findById(id: string): Promise<StoreProduct | null> {
    const doc = await this.collection().doc(id).get();
    return doc.exists ? this.toEntity(doc.id, doc.data()!) : null;
  }

  async findAll(): Promise<StoreProduct[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  async findPublished(): Promise<StoreProduct[]> {
    const snapshot = await this.collection()
      .where('published', '==', true)
      .get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  async save(product: StoreProduct): Promise<void> {
    const { id, ...data } = product;
    // JSON round-trip: o Firestore recusa `undefined`, e os opcionais (capa,
    // nível do download) ficam simplesmente ausentes.
    await this.collection()
      .doc(id)
      .set(JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
  }

  async saveOrders(
    orders: { id: string; order: number }[],
    updatedAt: string,
  ): Promise<void> {
    const batch = this.db.batch();
    for (const { id, order } of orders) {
      batch.update(this.collection().doc(id), { order, updatedAt });
    }
    await batch.commit();
  }

  async delete(id: string): Promise<void> {
    await this.collection().doc(id).delete();
  }

  private collection() {
    return this.db.collection(STORE_PRODUCTS_COLLECTION);
  }

  private toEntity(id: string, data: Record<string, any>): StoreProduct {
    return {
      id,
      kind: data.kind,
      title: data.title ?? '',
      description: data.description ?? '',
      ...(data.cover ? { cover: data.cover } : {}),
      price: data.price ?? 0,
      maxInstallments: data.maxInstallments ?? STORE_MAX_INSTALLMENTS,
      published: data.published === true,
      order: data.order ?? 0,
      ...(data.level ? { level: data.level } : {}),
      ...(data.moduleId ? { moduleId: data.moduleId } : {}),
      files: data.files ?? [],
      createdAt: data.createdAt ?? '',
      updatedAt: data.updatedAt ?? data.createdAt ?? '',
    };
  }
}
