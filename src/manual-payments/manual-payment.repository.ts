import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { FIRESTORE } from '../firestore/firestore.module';
import { ManualPayment } from './manual-payment.entity';

/**
 * Coleção `manualPayments` (spec 026 §9). Só consultas de **um campo** —
 * igualdade em `studentId`, igualdade ou intervalo em `month` — e a ordenação
 * em memória: um `where` + `orderBy` em campos diferentes pediria índice
 * composto, e índice composto aqui é publicado à mão por projeto
 * (`firestore.indexes.json`). Assim a coleção não precisa de índice nenhum.
 */
@Injectable()
export class ManualPaymentRepository {
  private readonly collection = 'manualPayments';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private get payments() {
    return this.db.collection(this.collection);
  }

  async create(payment: Omit<ManualPayment, 'id'>): Promise<ManualPayment> {
    const id = randomUUID();
    const created = new ManualPayment({ ...payment, id });
    await this.payments.doc(id).set(stripUndefined({ ...created }));
    return created;
  }

  /** Lançamentos de um aluno, do mais recente para o mais antigo. */
  async findByStudent(studentId: string): Promise<ManualPayment[]> {
    const snapshot = await this.payments
      .where('studentId', '==', studentId)
      .get();
    return snapshot.docs
      .map((doc) => this.toEntity(doc.id, doc.data()))
      .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
  }

  /** Lançamentos de um mês ('YYYY-MM'), do mais antigo para o mais recente. */
  async findByMonth(month: string): Promise<ManualPayment[]> {
    const snapshot = await this.payments.where('month', '==', month).get();
    return snapshot.docs
      .map((doc) => this.toEntity(doc.id, doc.data()))
      .sort((a, b) => a.grantedAt.localeCompare(b.grantedAt));
  }

  /** Lançamentos de um ano inteiro — um intervalo no mesmo campo `month`. */
  async findByYear(year: number): Promise<ManualPayment[]> {
    const snapshot = await this.payments
      .where('month', '>=', `${year}-01`)
      .where('month', '<=', `${year}-12`)
      .get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  async markVoided(
    id: string,
    voidedAt: string,
    voidedBy: string,
  ): Promise<void> {
    await this.payments.doc(id).update({ voidedAt, voidedBy });
  }

  private toEntity(
    id: string,
    data: FirebaseFirestore.DocumentData,
  ): ManualPayment {
    return new ManualPayment({ ...data, id });
  }
}

/** O Firestore recusa `undefined` em `set`; campos opcionais ausentes saem. */
function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as Partial<T>;
}
