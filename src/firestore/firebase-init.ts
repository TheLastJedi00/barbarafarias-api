import * as admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const logger = new Logger('FirebaseInit');

/**
 * Inicializa o Firebase App (idempotente). Local: lê serviceAccountKey.json;
 * nuvem: decodifica FIREBASE_SERVICE_ACCOUNT_BASE64. Chamado pela factory do
 * FirestoreModule antes do primeiro admin.firestore().
 */
export function initializeFirebase(): void {
  if (admin.apps.length) {
    return;
  }

  const localKeyPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
  let serviceAccount: ServiceAccount;

  if (fs.existsSync(localKeyPath)) {
    serviceAccount = require(localKeyPath);
    logger.log('Firebase: usando arquivo de credenciais local.');
  } else {
    const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!base64) {
      throw new Error('FATAL: Credenciais do Firebase não encontradas.');
    }
    const buffer = Buffer.from(base64, 'base64');
    serviceAccount = JSON.parse(buffer.toString('utf-8'));
    logger.log('Firebase: credenciais carregadas do ambiente.');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
