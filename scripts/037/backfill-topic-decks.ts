/**
 * Baralhos dos tópicos que já existiam (spec 037), quando ninguém pode clicar
 * em "Gerar os que faltam" no Prompt Manager daquele ambiente.
 *
 *   npx ts-node scripts/037/backfill-topic-decks.ts --project barbarafarias
 *     lista os tópicos sem baralho pronto (só lê)
 *
 *   ... --apply [--concurrency 3]
 *     gera e grava. Retomável: pula os baralhos `ready`.
 *
 * Usa as mesmas funções da API (prompt do baralho e montagem das cartas) e
 * grava o mesmo formato do `FlashcardDeckRepository`. A chave do Gemini vem
 * do `.env` local (GEMINI_API_KEY / GEMINI_MODEL).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { DEFAULT_FLASHCARDS_PROMPT } from '../../src/curriculum/flashcards-prompt.default';
import {
  FLASHCARD_DECKS_COLLECTION,
  GeneratedDeckSchema,
  TOPIC_DECK_SIZE,
  toDeckCards,
  topicDeckId,
} from '../../src/flashcards/flashcard.model';
import { buildTopicDeckPrompt } from '../../src/flashcards/prompts';
import { LEVELS, Level } from '../../src/types/student.level';
import { firestoreFor, parseArgs } from './firebase';

const REQUEST = 44;
const MIN_CARDS = 30;

function env(name: string): string | undefined {
  const file = path.resolve(process.cwd(), '.env');
  const line = fs
    .readFileSync(file, 'utf-8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.split('=').slice(1).join('=').replace(/^"|"$/g, '') || undefined;
}

interface Job {
  level: Level;
  moduleId: string;
  moduleTitle: string;
  moduleContext: string;
  topicId: string;
  topicTitle: string;
  levelPrompt: string;
}

async function main() {
  const { project, flags, values } = parseArgs();
  const db = firestoreFor(project);
  const decks = db.collection(FLASHCARD_DECKS_COLLECTION);

  const flashDoc = await db.collection('curriculum').doc('flashcards').get();
  const flashcardsPrompt = flashDoc.exists
    ? ((flashDoc.get('prompt') as string) ?? '')
    : DEFAULT_FLASHCARDS_PROMPT;

  const jobs: Job[] = [];
  for (const level of LEVELS) {
    const doc = await db.collection('curriculum').doc(level).get();
    if (!doc.exists) continue;
    const data = doc.data() as {
      prompt?: string;
      modules?: {
        id: string;
        title: string;
        context?: string;
        topics?: {
          id: string;
          title?: string;
          prompt?: string;
          videoOnly?: boolean;
        }[];
      }[];
    };
    const ready = new Set(
      (await decks.where('level', '==', level).get()).docs
        .filter((d) => d.get('status') === 'ready')
        .map((d) => d.id),
    );
    for (const mod of data.modules ?? []) {
      for (const topic of mod.topics ?? []) {
        if (topic.videoOnly) continue;
        if (ready.has(topicDeckId(level, topic.id))) continue;
        jobs.push({
          level,
          moduleId: mod.id,
          moduleTitle: mod.title,
          moduleContext: mod.context ?? '',
          topicId: topic.id,
          topicTitle: topic.title ?? topic.prompt ?? '',
          levelPrompt: data.prompt ?? '',
        });
      }
    }
  }
  const byLevel = LEVELS.map(
    (l) => `${l}: ${jobs.filter((j) => j.level === l).length}`,
  );
  console.log(
    `Tópicos sem baralho pronto: ${jobs.length} (${byLevel.join(', ')})`,
  );
  if (!flags.has('apply') || jobs.length === 0) {
    if (!flags.has('apply')) console.log('Nada gerado (falta --apply).');
    return;
  }

  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY ausente no .env.');
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: env('GEMINI_MODEL') || 'gemini-2.5-pro',
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 50000,
      temperature: 0.6,
    },
  });

  let done = 0;
  let failed = 0;
  const run = async (job: Job) => {
    const id = topicDeckId(job.level, job.topicId);
    const now = () => new Date().toISOString();
    await decks.doc(id).set(
      {
        id,
        kind: 'topic',
        level: job.level,
        moduleId: job.moduleId,
        topicId: job.topicId,
        status: 'generating',
        updatedAt: now(),
      },
      { merge: true },
    );
    try {
      const prompt = buildTopicDeckPrompt({
        flashcardsPrompt,
        levelPrompt: job.levelPrompt,
        level: job.level,
        moduleTitle: job.moduleTitle,
        moduleContext: job.moduleContext,
        topicTitle: job.topicTitle,
        count: REQUEST,
      });
      const result = await model.generateContent(prompt);
      const text = result.response
        .text()
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      const { cards: generated } = GeneratedDeckSchema.parse(JSON.parse(text));
      const cards = toDeckCards(generated, TOPIC_DECK_SIZE);
      if (cards.length < MIN_CARDS)
        throw new Error(`só ${cards.length} cartas aproveitáveis`);
      const at = now();
      await decks.doc(id).set(
        {
          status: 'ready',
          cards,
          sourceTitle: job.topicTitle,
          generatedAt: at,
          updatedAt: at,
          error: null,
        },
        { merge: true },
      );
      done++;
      console.log(
        `ok ${done + failed}/${jobs.length} ${job.level} "${job.topicTitle}" (${cards.length})`,
      );
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      await decks
        .doc(id)
        .set(
          { status: 'error', error: message, updatedAt: now() },
          { merge: true },
        );
      console.log(
        `ERRO ${done + failed}/${jobs.length} ${job.level} "${job.topicTitle}": ${message}`,
      );
    }
  };

  const concurrency = Number(values.get('concurrency') ?? 3);
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) await run(queue.shift()!);
    }),
  );
  console.log(`Fim: ${done} gerados, ${failed} com erro.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
