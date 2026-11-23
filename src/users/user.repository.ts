import type { PracticeSummary } from '../practice/mission-builder';
import { Inject, Injectable } from '@nestjs/common';
import { User } from './user.entity';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { ROLES, Role, resolveRole } from '../types/role';

@Injectable()
export class UserRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async save(user: User, uid: string): Promise<string> {
    const userObject = instanceToPlain(user);
    await this.db.collection('users').doc(uid).set(userObject);
    return uid;
  }

  /**
   * Lista usuários. Quando `role` é informado, consulta o Firestore pelo papel
   * novo e pelo booleano legado (documentos ainda não migrados) e reconcilia o
   * resultado com `resolveRole` — assim a listagem de alunos nunca vaza
   * professoras, mesmo com a base em migração (spec 010 §2.1).
   */
  async findAll(role?: Role): Promise<User[]> {
    const collection = this.db.collection('users');

    if (!role) {
      const snapshot = await collection.get();
      return snapshot.docs.map((doc) => plainToInstance(User, doc.data()));
    }

    const queries = [collection.where('role', '==', role)];
    if (role === ROLES.STUDENT) {
      queries.push(collection.where('isTeacher', '==', false));
    } else if (role === ROLES.TEACHER) {
      queries.push(collection.where('isTeacher', '==', true));
    }

    const snapshots = await Promise.all(queries.map((query) => query.get()));
    const byId = new Map<string, User>();
    for (const snapshot of snapshots) {
      for (const doc of snapshot.docs) {
        byId.set(doc.id, plainToInstance(User, doc.data()));
      }
    }

    return [...byId.values()].filter((user) => resolveRole(user) === role);
  }

  /**
   * O id da entidade é o do documento. Depender do campo `id` gravado dentro
   * do corpo funciona para quem foi criado pela API, mas documentos feitos à
   * mão no console do Firestore não o têm — e saíam daqui com `id:
   * undefined`, levando junto o `PublicTeacherDto.id` (spec 013 Task 46.2).
   */
  async findById(id: string): Promise<User | null> {
    const doc = await this.db.collection('users').doc(id).get();
    if (doc.exists) {
      const data = doc.data();
      return plainToInstance(User, { ...data, id: data?.id ?? doc.id });
    }
    return null;
  }

  /**
   * Médias dos flashcards de vários alunos numa leitura em lote, só com o campo
   * que interessa (spec 037: a lista de aulas mostra a média de cada um).
   */
  async findPracticeSummaries(
    ids: string[],
  ): Promise<Map<string, PracticeSummary>> {
    const summaries = new Map<string, PracticeSummary>();
    if (ids.length === 0) return summaries;
    const refs = [...new Set(ids)].map((id) =>
      this.db.collection('users').doc(id),
    );
    const docs = await this.db.getAll(...refs, {
      fieldMask: ['practiceSummary'],
    });
    for (const doc of docs) {
      const summary = doc.get('practiceSummary') as PracticeSummary | undefined;
      if (doc.exists && summary) summaries.set(doc.id, summary);
    }
    return summaries;
  }

  async findByEmail(email: string): Promise<User | null> {
    const snapshot = await this.db
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const data: {} = snapshot.docs[0].data();
    const user: User = plainToInstance(User, data);
    return user;
  }

  async update(user: User): Promise<void> {
    const userId = user.id;
    const userObject = instanceToPlain(user);
    await this.db
      .collection('users')
      .doc(userId!)
      .set(userObject, { merge: true });
  }

  /**
   * Grava só o espelho da assinatura (spec 012 Task 17/18). É um `merge`
   * cirúrgico em vez de um `update(user)` completo porque o webhook do gateway
   * chega em paralelo com edições de perfil — reescrever o documento inteiro a
   * partir de uma cópia lida antes desfaria o que a outra gravação salvou.
   */
  async updateSubscriptionState(
    id: string,
    state: {
      subscriptionPlan?: string;
      subscriptionStatus?: string;
      isPaying: boolean;
      accessUntil?: string;
      /** Ausente = não mexe (a assinatura antiga não apaga o tier). */
      planTier?: string;
      fidelityBrokenAt?: string;
      /** Spec 036: início da turma; `null` limpa (plano que já começou). */
      accessFrom?: string | null;
      /** Spec 036: plano de tier pago tira o `tier: 'modules'` da loja. */
      leavesStore?: boolean;
    },
  ): Promise<void> {
    await this.db
      .collection('users')
      .doc(id)
      .set(
        {
          subscriptionPlan: state.subscriptionPlan ?? null,
          subscriptionStatus: state.subscriptionStatus ?? null,
          isPaying: state.isPaying,
          accessUntil: state.accessUntil ?? null,
          ...(state.planTier ? { planTier: state.planTier } : {}),
          ...(state.fidelityBrokenAt
            ? { fidelityBrokenAt: state.fidelityBrokenAt }
            : {}),
          ...(state.accessFrom !== undefined
            ? { accessFrom: state.accessFrom }
            : {}),
          ...(state.leavesStore ? { tier: FieldValue.delete() } : {}),
        },
        { merge: true },
      );
  }

  /**
   * Grava só a concessão manual da gerente (spec 025). `merge` cirúrgico pelo
   * mesmo motivo do método acima, e com uma simetria proposital: os dois campos
   * de acesso têm gravações separadas porque têm autores separados — o gateway
   * e a gerente —, e nenhum dos dois pode apagar o do outro.
   *
   * `null` revoga: no Firestore, ausência de chave num `merge` significa "não
   * mexi nisso", e revogar precisa de um valor explícito para apagar o que está
   * lá.
   */
  async updateManualAccess(id: string, until: string | null): Promise<void> {
    await this.db
      .collection('users')
      .doc(id)
      .set({ manualAccessUntil: until }, { merge: true });
  }

  async delete(id: string): Promise<void> {
    await this.db.collection('users').doc(id).delete();
  }
}
