/**
 * Remove o vocabulário (`words`) que o material personalizado guardava em cada
 * tópico antes da spec 037 — agora ele mora nos flashcards.
 *
 *   npx ts-node scripts/037/remove-legacy-words.ts --project barbarafarias-dev
 *     só conta (padrão)
 *
 *   ... --apply
 *     salva um backup JSON dos docs que vão mudar em scripts/037/backup/ e grava
 *
 * Varre o material do plano (`student_supplies`, inclusive o layout antigo com
 * `modules` embutido, e `supply_modules`) e o da loja (`storeSupplies` e
 * `storeSupplyModules`, inclusive os passos de uma geração em andamento).
 * Qualquer objeto com cara de tópico (`topic` + `words`) perde o `words`; o
 * resto do doc fica igual.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { firestoreFor, parseArgs } from './firebase';

const COLLECTIONS = [
  'student_supplies',
  'supply_modules',
  'storeSupplies',
  'storeSupplyModules',
];

/** Devolve a cópia sem `words` nos tópicos e quantos tópicos mudaram. */
export function stripWords(value: unknown): {
  value: unknown;
  removed: number;
} {
  if (Array.isArray(value)) {
    let removed = 0;
    const items = value.map((item) => {
      const r = stripWords(item);
      removed += r.removed;
      return r.value;
    });
    return { value: items, removed };
  }
  if (value && typeof value === 'object' && !isFirestoreValue(value)) {
    const source = value as Record<string, unknown>;
    let removed = 0;
    const out: Record<string, unknown> = {};
    const isTopic = 'topic' in source && 'words' in source;
    for (const [key, child] of Object.entries(source)) {
      if (isTopic && key === 'words') {
        removed++;
        continue;
      }
      const r = stripWords(child);
      removed += r.removed;
      out[key] = r.value;
    }
    return { value: out, removed };
  }
  return { value, removed: 0 };
}

/** Timestamp, referência etc. passam intactos. */
function isFirestoreValue(value: object): boolean {
  const name = value.constructor?.name;
  return !!name && name !== 'Object';
}

async function main() {
  const { project, flags } = parseArgs();
  const apply = flags.has('apply');
  const db = firestoreFor(project);
  const backup: Record<string, unknown> = {};
  const changes: { ref: FirebaseFirestore.DocumentReference; data: unknown }[] =
    [];
  let topics = 0;

  for (const name of COLLECTIONS) {
    const snapshot = await db.collection(name).get();
    let docs = 0;
    for (const doc of snapshot.docs) {
      const { value, removed } = stripWords(doc.data());
      if (removed === 0) continue;
      docs++;
      topics += removed;
      backup[`${name}/${doc.id}`] = doc.data();
      changes.push({ ref: doc.ref, data: value });
    }
    console.log(`${name}: ${snapshot.size} docs, ${docs} com words`);
  }
  console.log(`Total: ${changes.length} docs, ${topics} tópicos com words.`);

  if (!apply) {
    console.log('Nada gravado (falta --apply).');
    return;
  }
  if (changes.length === 0) return;

  const dir = path.resolve(__dirname, 'backup');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `words-${project}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log(`Backup: ${file}`);

  for (let i = 0; i < changes.length; i += 400) {
    const batch = db.batch();
    changes
      .slice(i, i + 400)
      .forEach(({ ref, data }) =>
        batch.set(ref, data as FirebaseFirestore.DocumentData),
      );
    await batch.commit();
  }
  console.log(`${changes.length} docs gravados sem words em ${project}.`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
