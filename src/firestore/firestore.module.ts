import { Global, Module } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';

/** Token de injeção para a instância única do Firestore. */
export const FIRESTORE = Symbol('FIRESTORE');

/**
 * Provê o Firestore via DI em vez de cada repositório chamar
 * admin.firestore() diretamente. Global: disponível para todos os módulos
 * sem precisar reimportar. A inicialização do Firebase App acontece no
 * bootstrap (main.ts) antes da criação da aplicação Nest.
 */
@Global()
@Module({
  providers: [
    {
      provide: FIRESTORE,
      useFactory: (): Firestore => admin.firestore(),
    },
  ],
  exports: [FIRESTORE],
})
export class FirestoreModule {}
