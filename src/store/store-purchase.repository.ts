import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { STORE_PURCHASES_COLLECTION } from './store.collections';
import { StorePurchase } from './store-purchase.model';

/** Coleção `storePurchases` (spec 032). Uma consulta, um campo. */
@Injectable()
export class StorePurchaseRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  newId(): string {
    return this.collection().doc().id;
  }

  async findById(id: string): Promise<StorePurchase | null> {
    const doc = await this.collection().doc(id).get();
    return doc.exists ? this.toEntity(doc.id, doc.data()!) : null;
  }

  async findAll(): Promise<StorePurchase[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  findByUser(userId: string): Promise<StorePurchase[]> {
    return this.findBy('userId', userId);
  }

  findByProduct(productId: string): Promise<StorePurchase[]> {
    return this.findBy('productId', productId);
  }

  findByModule(moduleId: string): Promise<StorePurchase[]> {
    return this.findBy('moduleId', moduleId);
  }

  /** Para o webhook: a order do Mercado Pago aponta para uma compra só. */
  async findByOrderId(orderId: string): Promise<StorePurchase | null> {
    const snapshot = await this.collection()
      .where('gateway.orderId', '==', orderId)
      .limit(1)
      .get();
    const doc = snapshot.docs[0];
    return doc ? this.toEntity(doc.id, doc.data()) : null;
  }

  async save(purchase: StorePurchase): Promise<void> {
    const { id, ...data } = purchase;
    await this.collection()
      .doc(id)
      .set(JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
  }

  private async findBy(field: string, value: string): Promise<StorePurchase[]> {
    const snapshot = await this.collection().where(field, '==', value).get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  private collection() {
    return this.db.collection(STORE_PURCHASES_COLLECTION);
  }

  private toEntity(id: string, data: Record<string, any>): StorePurchase {
    return {
      id,
      userId: data.userId,
      productId: data.productId,
      kind: data.kind,
      ...(data.level ? { level: data.level } : {}),
      ...(data.moduleId ? { moduleId: data.moduleId } : {}),
      titleSnapshot: data.titleSnapshot ?? '',
      priceSnapshot: data.priceSnapshot ?? 0,
      installments: data.installments ?? 1,
      method: data.method,
      status: data.status,
      gateway: data.gateway ?? {},
      termsVersion: data.termsVersion ?? '',
      ...(data.paidAt ? { paidAt: data.paidAt } : {}),
      ...(data.accessUntil ? { accessUntil: data.accessUntil } : {}),
      ...(data.refund ? { refund: data.refund } : {}),
      createdAt: data.createdAt ?? '',
      updatedAt: data.updatedAt ?? data.createdAt ?? '',
    };
  }
}
