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
   * Localiza a assinatura dona de uma cobrança. O webhook chega com o id da
   * cobrança no gateway e mais nada nosso, então o caminho de volta é este.
   * A coleção é pequena (uma linha por aluno) e o `array-contains` não serve
   * para procurar dentro de objetos, por isso o filtro é em memória.
   */
  async findByChargeId(chargeId: string): Promise<Subscription | null> {
    const all = await this.findAll();
    return (
      all.find((subscription) =>
        subscription.charges.some(
          (charge) => charge.gatewayChargeId === chargeId,
        ),
      ) ?? null
    );
  }

  /**
   * Localiza a assinatura pelo id dela no gateway. As renovações do plano
   * mensal chegam sem nenhum id nosso — a parcela só aponta para a assinatura
   * —, então este é o caminho de volta das cobranças que nós não emitimos.
   */
  async findByGatewaySubscriptionId(
    gatewaySubscriptionId: string,
  ): Promise<Subscription | null> {
    const all = await this.findAll();
    return (
      all.find(
        (subscription) =>
          subscription.gatewaySubscriptionId === gatewaySubscriptionId,
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
      gatewayChargeId: charge.gatewayChargeId ?? null,
      gatewayProvider: charge.gatewayProvider ?? null,
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
        // `abacatePayId` foi o nome de `gatewayChargeId` quando só havia um
        // provedor. Ele deixou de ser gravado na spec 023, mas continua sendo
        // **lido**: as parcelas antigas do Firestore só têm esse campo, e a
        // leitura é o que impede o histórico de sumir do painel financeiro.
        gatewayChargeId:
          charge.gatewayChargeId ?? charge.abacatePayId ?? undefined,
        gatewayProvider: charge.gatewayProvider ?? undefined,
      })),
    });
  }
}
