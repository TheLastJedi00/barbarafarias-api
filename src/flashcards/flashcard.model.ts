import { z } from 'zod';
import type { DeckProgress } from './deck-progress';
import { Level } from '../types/student.level';

/**
 * Flashcards da spec 037. Moram na coleção `flashcardDecks`, fora do material
 * personalizado: a missão diária nunca lê material e o material nunca mais
 * carrega vocabulário.
 */
export const FLASHCARD_DECKS_COLLECTION = 'flashcardDecks';

/** Cartas por baralho de tópico. */
export const TOPIC_DECK_SIZE = 40;
/** Cartas do aluno: 2 por missão × 31 dias, o maior mês. */
export const STUDENT_DECK_SIZE = 62;

export const PARTS_OF_SPEECH = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'phrasal verb',
  'expression',
] as const;

/** Uma carta como a IA devolve (sem `id`, que o BE atribui). */
export const GeneratedCardSchema = z.object({
  english: z.string().trim().min(1),
  portuguese: z.string().trim().min(1),
  pronounce: z.string().trim().min(1),
  partOfSpeech: z.string().trim().min(1),
  example: z.string().trim().min(1),
  exampleTranslation: z.string().trim().min(1),
});
export type GeneratedCard = z.infer<typeof GeneratedCardSchema>;

export const GeneratedDeckSchema = z.object({
  cards: z.array(GeneratedCardSchema).min(1),
});

export interface Flashcard extends GeneratedCard {
  /** Estável dentro do baralho (`c01`…); a chave global é `{deckId}:{id}`. */
  id: string;
}

export type DeckKind = 'topic' | 'student';
export type DeckStatus = 'generating' | 'ready' | 'error';

export interface FlashcardDeck {
  id: string;
  kind: DeckKind;
  status: DeckStatus;
  cards: Flashcard[];
  /** Só no baralho de tópico. Ausente no do aluno — a consulta por nível depende disso. */
  level?: Level;
  moduleId?: string;
  topicId?: string;
  /** Título do tópico quando o baralho foi gerado; diferente do atual = desatualizado. */
  sourceTitle?: string;
  studentId?: string;
  generatedAt?: string;
  updatedAt: string;
  error?: string;
  /** Andamento da geração (fix 037); só o baralho do aluno grava durante. */
  progress?: DeckProgress;
}

export function topicDeckId(level: Level, topicId: string): string {
  return `topic_${level}_${topicId}`;
}

export function studentDeckId(studentId: string): string {
  return `student_${studentId}`;
}

export function cardKey(deckId: string, cardId: string): string {
  return `${deckId}:${cardId}`;
}

/** Separa `{deckId}:{cardId}`. O deckId nunca tem `:`; o uuid do tópico também não. */
export function parseCardKey(
  key: string,
): { deckId: string; cardId: string } | null {
  const at = key.lastIndexOf(':');
  if (at <= 0 || at === key.length - 1) return null;
  return { deckId: key.slice(0, at), cardId: key.slice(at + 1) };
}

/**
 * Forma de comparar palavras: sem caixa, sem acento, sem o "to " do infinitivo
 * e sem pontuação. `To Follow-up` e `follow up` são a mesma carta.
 */
export function wordKey(english: string): string {
  return english
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^to\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Tira repetidas (e as de `exclude`), corta em `size` e numera `c01..`.
 * A ordem da IA é mantida: ela costuma pôr as mais úteis primeiro.
 */
export function toDeckCards(
  generated: GeneratedCard[],
  size: number,
  exclude: ReadonlySet<string> = new Set(),
): Flashcard[] {
  const seen = new Set(exclude);
  const cards: Flashcard[] = [];
  for (const card of generated) {
    const key = wordKey(card.english);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cards.push({
      id: `c${String(cards.length + 1).padStart(2, '0')}`,
      ...card,
    });
    if (cards.length === size) break;
  }
  return cards;
}
