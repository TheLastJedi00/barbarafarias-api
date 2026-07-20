import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { AuthUser } from './entities/auth-user.entity';

@Injectable()
export class AuthRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async save(authUser: AuthUser): Promise<void> {
    await this.db.collection('credentials').doc(authUser.id).set({
      id: authUser.id,
      email: authUser.email,
      password: authUser.password,
      role: authUser.role,
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.collection('credentials').doc(id).delete();
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
