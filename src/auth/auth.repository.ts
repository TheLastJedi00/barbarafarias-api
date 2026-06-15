import { Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { AuthUser } from './entities/auth-user.entity';

@Injectable()
export class AuthRepository {
  private readonly db: Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  async save(authUser: AuthUser): Promise<void> {
    try {
      await this.db.collection('credentials').doc(authUser.id).set({
        id: authUser.id,
        email: authUser.email,
        password: authUser.password,
        role: authUser.role,
      });
    } catch (error) {
      console.error('Erro ao salvar credencial:', error);
      throw error;
    }
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    const snapshot = await this.db
      .collection('credentials')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const data = snapshot.docs[0].data();
    return new AuthUser(data);
  }
}
