import { Global, Module } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { Auth } from 'firebase-admin/auth';
import { initializeFirebase } from './firebase-init';

/** Token de injeção para a instância única do Firebase Auth. */
export const FIREBASE_AUTH = Symbol('FIREBASE_AUTH');

/**
 * Provê o `admin.auth()` via DI, pelo mesmo motivo do `FirestoreModule`: com o
 * SDK injetado, `auth.service.spec.ts` e `user.service.spec.ts` montam um dublê
 * e nenhuma suíte deste projeto encosta na rede (spec 016 Task 69).
 *
 * Global: o Auth é usado pelo guard, pelo módulo de autenticação, pelos
 * serviços que criam contas e pelas migrações — reimportar em cada um deles
 * seria ruído.
 */
@Global()
@Module({
  providers: [
    {
      provide: FIREBASE_AUTH,
      useFactory: (): Auth => {
        initializeFirebase();
        return admin.auth();
      },
    },
  ],
  exports: [FIREBASE_AUTH],
})
export class FirebaseAuthModule {}
