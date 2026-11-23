/**
 * Prompts da spec 037, em dev e em prod.
 *
 *   npx ts-node scripts/037/prompts.ts --project barbarafarias-dev
 *     mostra o Prompt Principal e o Prompt de Flashcards gravados (só lê)
 *
 *   ... --principal arquivo.txt --apply
 *     grava o Prompt Principal revisado (sem as instruções de vocabulário)
 *
 *   ... --flashcards arquivo.txt --apply
 *     grava o Prompt de Flashcards (sem ele, vale o texto padrão do código)
 *
 * Sem `--apply`, mostra o que seria gravado e não grava nada.
 */
import * as fs from 'node:fs';
import { firestoreFor, parseArgs } from './firebase';

async function main() {
  const { project, flags, values } = parseArgs();
  const db = firestoreFor(project);
  const curriculum = db.collection('curriculum');

  for (const [docId, flag] of [
    ['principal', 'principal'],
    ['flashcards', 'flashcards'],
  ] as const) {
    const doc = await curriculum.doc(docId).get();
    const current = doc.exists ? (doc.get('prompt') as string) : null;
    console.log(`\n===== curriculum/${docId} (atual) =====`);
    console.log(current ?? '(não gravado)');

    const file = values.get(flag);
    if (!file) continue;
    const next = fs.readFileSync(file, 'utf-8').trim();
    console.log(`\n----- curriculum/${docId} (novo, de ${file}) -----`);
    console.log(next);
    if (flags.has('apply')) {
      await curriculum.doc(docId).set({ prompt: next }, { merge: true });
      console.log(`>> curriculum/${docId} gravado em ${project}.`);
    } else {
      console.log('>> nada gravado (falta --apply).');
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
