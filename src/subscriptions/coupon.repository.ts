import { Inject, Injectable } from '@nestjs/common';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
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

  /**
   * `usedCount` fica de fora: quem o escreve é `incrementUsage`, e regravar a
   * cópia lida antes apagaria um uso contado nesse meio-tempo.
   */
  async update(coupon: Coupon): Promise<void> {
    const plain = this.toPlain(coupon);
    delete plain.usedCount;
    await this.coupons.doc(coupon.id).set(plain, { merge: true });
  }

  /**
   * Conta um pagamento confirmado com o cupom (spec 035 §6). `increment` é
   * atômico no Firestore: dois webhooks ao mesmo tempo somam dois.
   *
   * Não recusa ao passar do `maxUses`: quando chega aqui o dinheiro já entrou,
   * e não há o que recusar. O limite é conferido na aplicação do cupom.
   */
  async incrementUsage(code: string): Promise<void> {
    const snapshot = await this.coupons
      .where('code', '==', normalizeCouponCode(code))
      .limit(1)
      .get();
    if (snapshot.empty) return;
    await snapshot.docs[0].ref.update({ usedCount: FieldValue.increment(1) });
  }

  private toPlain(coupon: Coupon): Record<string, unknown> {
    return {
      code: coupon.code,
      tierId: coupon.tierId ?? null,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      durationMonths: coupon.durationMonths ?? null,
      paymentModes: coupon.paymentModes ?? null,
      maxUses: coupon.maxUses ?? null,
      usedCount: coupon.usedCount ?? 0,
      active: coupon.active,
      createdAt: coupon.createdAt,
      createdBy: coupon.createdBy,
    };
  }

  /**
   * Lê os dois formatos: o de antes da spec 035 (`discountAmount`, sem tipo
   * nem tier) vira `amount` sem tier — vale só nos planos antigos.
   */
  private toEntity(id: string, data: Record<string, any>): Coupon {
    return new Coupon({
      id,
      code: data.code ?? '',
      tierId: data.tierId ?? undefined,
      discountType: data.discountType ?? 'amount',
      discountValue: data.discountValue ?? data.discountAmount ?? 0,
      durationMonths: data.durationMonths ?? null,
      paymentModes: data.paymentModes ?? undefined,
      maxUses: data.maxUses ?? null,
      usedCount: data.usedCount ?? 0,
      active: data.active ?? false,
      createdAt: data.createdAt ?? '',
      createdBy: data.createdBy ?? '',
    });
  }
}
