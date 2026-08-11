import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { FIRESTORE } from '../firestore/firestore.module';
import { Coupon, normalizeCouponCode } from './coupon.entity';

@Injectable()
export class CouponRepository {
  private readonly collection = 'coupons';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private get coupons() {
    return this.db.collection(this.collection);
  }

  /** Do mais novo para o mais antigo. Ordenação em memória: lista curta. */
  async findAll(): Promise<Coupon[]> {
    const snapshot = await this.coupons.get();
    return snapshot.docs
      .map((doc) => this.toEntity(doc.id, doc.data()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findById(id: string): Promise<Coupon | null> {
    const doc = await this.coupons.doc(id).get();
    return doc.exists ? this.toEntity(doc.id, doc.data()!) : null;
  }

  /** O código é normalizado na gravação, então a busca é exata. */
  async findByCode(code: string): Promise<Coupon | null> {
    const snapshot = await this.coupons
      .where('code', '==', normalizeCouponCode(code))
      .limit(1)
      .get();
    return snapshot.empty
      ? null
      : this.toEntity(snapshot.docs[0].id, snapshot.docs[0].data());
  }

  async create(coupon: Coupon): Promise<Coupon> {
    const id = coupon.id ?? randomUUID();
    const created = new Coupon({
      ...coupon,
      id,
      code: normalizeCouponCode(coupon.code),
    });
    await this.coupons.doc(id).set(this.toPlain(created));
    return created;
  }

  async update(coupon: Coupon): Promise<void> {
    await this.coupons
      .doc(coupon.id)
      .set(this.toPlain(coupon), { merge: true });
  }

  private toPlain(coupon: Coupon): Record<string, unknown> {
    return {
      code: coupon.code,
      discountAmount: coupon.discountAmount,
      durationMonths: coupon.durationMonths ?? null,
      active: coupon.active,
      createdAt: coupon.createdAt,
      createdBy: coupon.createdBy,
    };
  }

  private toEntity(id: string, data: Record<string, any>): Coupon {
    return new Coupon({
      id,
      code: data.code ?? '',
      discountAmount: data.discountAmount ?? 0,
      durationMonths: data.durationMonths ?? null,
      active: data.active ?? false,
      createdAt: data.createdAt ?? '',
      createdBy: data.createdBy ?? '',
    });
  }
}
