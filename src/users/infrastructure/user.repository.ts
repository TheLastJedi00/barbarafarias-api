import { Injectable } from '@nestjs/common';
import { User } from '../domain/user.model';
import { UserRepository } from '../domain/user.repository.port';
import { Firestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

@Injectable()
export class UserFirestoreRepository implements UserRepository {
  private readonly db: Firestore;
  constructor() {
    this.db = admin.firestore();
  }
  

  async save(user: User, uid: string): Promise<string> {
    const userObject = user.toPlainObject();
    try {
      const docRef = await this.db.collection('users').doc(uid).set(userObject);
      return uid;
    } catch (error) {
      console.error('Erro no Repositório ao salvar usuário:', error);
      throw error;
    }
  }

  async findAll(): Promise<User[]> {
    const querySnapshot = await this.db.collection('users').get();
    const users = querySnapshot.docs.map((doc) => {
      const data = doc.data();
      return new User(
        data.fullName,
        data.phone,
        data.email,
        data.isPaying,
        data.isTeacher,
        data.level,
        data.objectives,
        data.prognosis,
        doc.id,
      );
    });
    return users;
  }

  async findById(id: string): Promise<User | null> {
    const doc = await this.db.collection('users').doc(id).get();
    if (doc.exists) {
      const data = doc.data();
      const user = new User(
        data!.fullName,
        data!.phone,
        data!.email,
        data!.isPaying,
        data!.isTeacher,
        data!.level,
        data!.objectives,
        data!.prognosis,
        doc.id,
      );
      return user;
    }
    return null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const snapshot = await this.db.collection('users').where('email', '==', email).get();
    let user: User | null = null;
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      user = new User(
        data.fullName,
        data.phone,
        data.email,
        data.isPaying,
        data.isTeacher,
        data.level,
        data.objectives,
        data.prognosis,
        doc.id,
      );
    });
    return user;
  }

  async update(user: User): Promise<void> {
    const userId = user.getId();
    const userObject = user.toPlainObject();
    await this.db.collection('users').doc(userId).set(userObject);
  }

  async delete(id: string): Promise<void> {
    await this.db.collection('users').doc(id).delete();
  }
}
