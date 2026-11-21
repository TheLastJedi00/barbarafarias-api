import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { Contract } from './contract.entity';

/** gRPC ALREADY_EXISTS: o `create` do Firestore recusa sobrescrever. */
const ALREADY_EXISTS = 6;

@Injectable()
export class ContractRepository {
  private readonly collection = 'contracts';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /**
   * Cria o contrato; se ele já existe, **devolve o gravado** e não toca em
   * nada. `create` (e não `set`) é a garantia da imutabilidade no banco.
   */
  async create(contract: Contract): Promise<Contract> {
    const ref = this.db.collection(this.collection).doc(contract.id);
    const plain = { ...contract, createdAt: new Date().toISOString() };
    delete (plain as Partial<Contract>).id;
    try {
      await ref.create(plain);
      return new Contract({ ...plain, id: contract.id });
    } catch (error) {
      if ((error as { code?: number }).code !== ALREADY_EXISTS) throw error;
      const existing = await this.findById(contract.id);
      if (!existing) throw error;
      return existing;
    }
  }

  async findById(id: string): Promise<Contract | null> {
    const doc = await this.db.collection(this.collection).doc(id).get();
    if (!doc.exists) return null;
    return new Contract({ ...(doc.data() as Partial<Contract>), id: doc.id });
  }

  /** Do mais recente para o mais antigo. */
  async findByStudent(studentId: string): Promise<Contract[]> {
    const snapshot = await this.db
      .collection(this.collection)
      .where('studentId', '==', studentId)
      .get();
    return snapshot.docs
      .map(
        (doc) =>
          new Contract({ ...(doc.data() as Partial<Contract>), id: doc.id }),
      )
      .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
  }
}
