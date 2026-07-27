import { Inject, Injectable } from '@nestjs/common';
import { User } from './user.entity';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { ROLES, Role } from '../types/role';

@Injectable()
export class UserRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async save(user: User, uid: string): Promise<string> {
    const userObject = instanceToPlain(user);
    await this.db.collection('users').doc(uid).set(userObject);
    return uid;
  }

  /**
   * Lista usuários. Quando `role` é informado, filtra por papel no próprio
   * Firestore (garantia de que a listagem de alunos nunca vaza teachers).
   */
  async findAll(role?: Role): Promise<User[]> {
    const collection = this.db.collection('users');
    const query =
      role === ROLES.STUDENT
        ? collection.where('isTeacher', '==', false)
        : role === ROLES.TEACHER
          ? collection.where('isTeacher', '==', true)
          : collection;
    const querySnapshot = await query.get();
    const users = querySnapshot.docs.map((doc) => {
      const data = doc.data();
      return plainToInstance(User, data);
    });
    return users;
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

  async delete(id: string): Promise<void> {
    await this.db.collection('users').doc(id).delete();
  }
}
