import { Injectable } from '@nestjs/common';
import { User } from './user.entity';
import { Firestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { instanceToPlain, plainToInstance } from 'class-transformer';

@Injectable()
export class UserRepository {
  private readonly db: Firestore;
  constructor() {
    this.db = admin.firestore();
  }

  async save(user: User, uid: string): Promise<string> {
    const userObject = instanceToPlain(user);
    try {
      await this.db.collection('users').doc(uid).set(userObject);
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
    await this.db.collection('users').doc(userId!).set(userObject);
  }

  async delete(id: string): Promise<void> {
    await this.db.collection('users').doc(id).delete();
  }
}
