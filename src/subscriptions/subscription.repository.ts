import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { Subscription, SubscriptionStatus } from './subscription.entity';

@Injectable()
export class SubscriptionRepository {
  private readonly collection = 'subscriptions';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private get subscriptions() {
    return this.db.collection(this.collection);
  }

  /** O id do documento é o `studentId`: um aluno, uma assinatura. */
  async findByStudent(studentId: string): Promise<Subscription | null> {
    const doc = await this.subscriptions.doc(studentId).get();
    return doc.exists ? this.toEntity(doc.id, doc.data()!) : null;
  }

  async findAll(): Promise<Subscription[]> {
    const snapshot = await this.subscriptions.get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  /**
   * Assinaturas em um dado status. Usado pelo painel da gerente para projetar
   * a receita a partir de quem está ativo (RF6).
   */
  async findByStatus(status: SubscriptionStatus): Promise<Subscription[]> {
    const snapshot = await this.subscriptions
      .where('status', '==', status)
      .get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  /**
   * Localiza a assinatura dona de uma cobrança do AbacatePay. O webhook chega
   * com o id da cobrança e mais nada nosso, então o caminho de volta é este.
   * A coleção é pequena (uma linha por aluno) e o `array-contains` não serve
   * para procurar dentro de objetos, por isso o filtro é em memória.
   */
  async findByChargeId(abacatePayId: string): Promise<Subscription | null> {
    const all = await this.findAll();
    return (
      all.find((subscription) =>
        subscription.charges.some(
          (charge) => charge.abacatePayId === abacatePayId,
        ),
      ) ?? null
    );
  }

  async save(subscription: Subscription): Promise<Subscription> {
    await this.subscriptions
      .doc(subscription.studentId)
      .set(this.toPlain(subscription));
    return subscription;
  }

  async delete(studentId: string): Promise<void> {
    await this.subscriptions.doc(studentId).delete();
  }

  private toPlain(subscription: Subscription): Record<string, unknown> {
    const plain: Record<string, unknown> = { ...subscription };
    delete plain.id;
    // Firestore rejeita `undefined`; `null` (cupom vitalício) é valor válido.
    for (const key of Object.keys(plain)) {
      if (plain[key] === undefined) delete plain[key];
    }
    plain.charges = subscription.charges.map((charge) => ({
      index: charge.index,
      dueDate: charge.dueDate,
      amount: charge.amount,
      status: charge.status,
      paidAt: charge.paidAt ?? null,
      abacatePayId: charge.abacatePayId ?? null,
    }));
    return plain;
  }

  private toEntity(id: string, data: Record<string, any>): Subscription {
    return new Subscription({
      ...data,
      id,
      studentId: data.studentId ?? id,
      charges: (data.charges ?? []).map((charge: Record<string, any>) => ({
        index: charge.index,
        dueDate: charge.dueDate,
        amount: charge.amount,
        status: charge.status,
        paidAt: charge.paidAt ?? undefined,
        abacatePayId: charge.abacatePayId ?? undefined,
      })),
    });
  }
}
