import { Inject, Injectable } from '@nestjs/common';
import { User } from './user.entity';
import { Firestore } from 'firebase-admin/firestore';
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

  async findById(id: string): Promise<User | null> {
    const doc = await this.db.collection('users').doc(id).get();
    if (doc.exists) {
      const data = doc.data();
      const user = plainToInstance(User, data);
      return user;
    }
    return null;
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
        },
        { merge: true },
      );
  }

  async delete(id: string): Promise<void> {
    await this.db.collection('users').doc(id).delete();
  }
}
