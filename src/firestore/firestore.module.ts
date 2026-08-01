import { Global, Module } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import { initializeFirebase } from './firebase-init';

/** Token de injeção para a instância única do Firestore. */
export const FIRESTORE = Symbol('FIRESTORE');

/**
 * Provê o Firestore via DI em vez de cada repositório chamar
 * admin.firestore() diretamente. Global: disponível para todos os módulos
 * sem precisar reimportar. A factory garante que o Firebase App seja
 * inicializado antes do primeiro acesso ao Firestore.
 */
@Global()
@Module({
  providers: [
    {
      provide: FIRESTORE,
      useFactory: (): Firestore => {
        initializeFirebase();
        const db = admin.firestore();
        db.settings({ ignoreUndefinedProperties: true });
        return db;
      },
    },
  ],
  exports: [FIRESTORE],
})
export class FirestoreModule {}
