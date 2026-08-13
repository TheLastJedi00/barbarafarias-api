import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { PlanAcceptance } from './plan-acceptance.entity';

/**
 * `planAcceptances`: um documento por aceite, **só criação e leitura**.
 *
 * Não há `update` nem `delete` aqui, e a ausência é o desenho: um registro
 * probatório que pode ser editado não prova nada. A página da gerente é
 * consulta — não edita, não apaga (§7.4).
 */
@Injectable()
export class PlanAcceptanceRepository {
  private readonly collection = 'planAcceptances';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async create(acceptance: PlanAcceptance): Promise<PlanAcceptance> {
    const { id, ...data } = acceptance;
    await this.db.collection(this.collection).doc(id).set(data);
    return acceptance;
  }

  /** Todos os aceites, do mais recente para o mais antigo. */
  async findAll(): Promise<PlanAcceptance[]> {
    const snapshot = await this.db.collection(this.collection).get();
    return snapshot.docs
      .map((doc) => new PlanAcceptance({ id: doc.id, ...doc.data() }))
      .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
  }
}
