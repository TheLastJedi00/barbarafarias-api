/**
 * Conexão dos scripts da spec 037 com o Firestore de um projeto escolhido.
 *
 * - Se a chave local (`serviceAccountKey.json` ou `FIREBASE_SERVICE_ACCOUNT_BASE64`
 *   do `.env`) é do projeto pedido, usa ela — é o caso de dev.
 * - Senão, usa o login do Firebase CLI da máquina (`firebase login`), que é
 *   como a produção é alcançada daqui: o `.env` local nunca tem a chave de prod.
 *
 * Nada aqui roda no servidor; os scripts ficam fora do build (tsconfig.build).
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import { Firestore as GoogleFirestore } from '@google-cloud/firestore';

interface ServiceAccountJson {
  project_id: string;
  [key: string]: unknown;
}

function localServiceAccount(): ServiceAccountJson | null {
  const file = path.resolve(process.cwd(), 'serviceAccountKey.json');
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as ServiceAccountJson;
  }
  const envFile = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envFile)) return null;
  const line = fs
    .readFileSync(envFile, 'utf-8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('FIREBASE_SERVICE_ACCOUNT_BASE64='));
  const base64 = line?.split('=').slice(1).join('=').replace(/^"|"$/g, '');
  if (!base64) return null;
  return JSON.parse(
    Buffer.from(base64, 'base64').toString('utf-8'),
  ) as ServiceAccountJson;
}

interface AuthorizedUser {
  type: 'authorized_user';
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

/** O cliente OAuth do Firebase CLI vem do próprio pacote instalado, não de uma cópia aqui. */
function firebaseCliCredential(): AuthorizedUser {
  const config = path.join(
    os.homedir(),
    '.config',
    'configstore',
    'firebase-tools.json',
  );
  if (!fs.existsSync(config)) {
    throw new Error('Firebase CLI sem login. Rode `firebase login` antes.');
  }
  const refreshToken = (
    JSON.parse(fs.readFileSync(config, 'utf-8')) as {
      tokens?: { refresh_token?: string };
    }
  ).tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error('Firebase CLI sem login. Rode `firebase login` antes.');
  }
  const root = execSync('npm root -g').toString().trim();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const api = require(path.join(root, 'firebase-tools', 'lib', 'api.js')) as {
    clientId: () => string;
    clientSecret: () => string;
  };
  return {
    type: 'authorized_user',
    client_id: api.clientId(),
    client_secret: api.clientSecret(),
    refresh_token: refreshToken,
  };
}

export function firestoreFor(projectId: string): Firestore {
  const local = localServiceAccount();
  if (local?.project_id === projectId) {
    const app = admin.initializeApp(
      {
        credential: admin.credential.cert(local as admin.ServiceAccount),
        projectId,
      },
      `p-${projectId}`,
    );
    const db = app.firestore();
    db.settings({ ignoreUndefinedProperties: true });
    console.log(`Projeto ${projectId} (chave local)`);
    return db;
  }
  // O Firestore do firebase-admin só aceita chave de serviço; o cliente do
  // Google Cloud, que ele embrulha, aceita a credencial de usuário do CLI.
  const db = new GoogleFirestore({
    projectId,
    credentials: firebaseCliCredential() as unknown as Record<string, string>,
    ignoreUndefinedProperties: true,
  }) as unknown as Firestore;
  console.log(`Projeto ${projectId} (login do Firebase CLI)`);
  return db;
}

/** `--project <id>` obrigatório; o resto dos argumentos como flags simples. */
export function parseArgs(): {
  project: string;
  flags: Set<string>;
  values: Map<string, string>;
} {
  const args = process.argv.slice(2);
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      values.set(arg.slice(2), next);
      i++;
    } else {
      flags.add(arg.slice(2));
    }
  }
  const project = values.get('project');
  if (!project || !['barbarafarias', 'barbarafarias-dev'].includes(project)) {
    throw new Error(
      'Use --project barbarafarias-dev ou --project barbarafarias.',
    );
  }
  return { project, flags, values };
}
