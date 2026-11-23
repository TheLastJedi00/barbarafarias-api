import { addDays } from '../common/time';
import { Flashcard } from '../flashcards/flashcard.model';

/**
 * Regras puras da missão diária (spec 037 §3.4–3.6): montar as 10 cartas do
 * dia e aplicar uma resposta. Sem Firestore aqui — o serviço lê, chama e grava
 * numa transação.
 */

export const MISSION_SIZE = 10;
/** 20% da missão é do aluno (decisão do usuário, 2026-11-22). */
export const STUDENT_SLOTS = 2;
/** Revisões do banco por missão, para o dia não virar só revisão. */
export const MAX_POOL_RETRY = 4;
/** Quanto tempo o `seen` lembra de uma carta. */
export const SEEN_DAYS = 90;

export type CardSource = 'student' | 'topic';

/** Uma carta disponível para a missão: a chave global e o conteúdo. */
export interface Candidate {
  key: string;
  card: Flashcard;
}

/** Cópia da carta dentro do doc do dia: o dia não muda se o baralho for regerado. */
export interface MissionCard extends Omit<Flashcard, 'id'> {
  key: string;
  source: CardSource;
}

export interface MissionAnswer {
  correct: boolean;
  at: string;
}

export interface MissionDay {
  /** `YYYY-MM-DD` de Brasília. */
  day: string;
  cards: MissionCard[];
  answers: Record<string, MissionAnswer>;
  score: number;
  completedAt?: string;
}

export interface SeenEntry {
  day: string;
  correct: boolean;
}

export interface PracticeProgress {
  streak: number;
  bestStreak: number;
  lastCompletedDay?: string;
  totalCorrect: number;
  totalAnswered: number;
  scoreSum: number;
  missionsCompleted: number;
  months: Record<string, { scoreSum: number; missions: number }>;
  seen: Record<string, SeenEntry>;
  retry: string[];
}

/** O que vai para `users/{uid}.practiceSummary`. */
export interface PracticeSummary {
  average: number;
  missions: number;
}

export function emptyProgress(): PracticeProgress {
  return {
    streak: 0,
    bestStreak: 0,
    totalCorrect: 0,
    totalAnswered: 0,
    scoreSum: 0,
    missionsCompleted: 0,
    months: {},
    seen: {},
    retry: [],
  };
}

export function pruneSeen(
  seen: Record<string, SeenEntry>,
  today: string,
): Record<string, SeenEntry> {
  const cutoff = addDays(today, -SEEN_DAYS);
  return Object.fromEntries(
    Object.entries(seen).filter(([, entry]) => entry.day >= cutoff),
  );
}

export function practiceSummary(
  progress: Pick<PracticeProgress, 'scoreSum' | 'missionsCompleted'>,
): PracticeSummary | null {
  if (progress.missionsCompleted <= 0) return null;
  return {
    average:
      Math.round((progress.scoreSum / progress.missionsCompleted) * 10) / 10,
    missions: progress.missionsCompleted,
  };
}

/**
 * Sequência que vale hoje: a gravada só segue viva se a última missão foi
 * hoje ou ontem. Senão o aluno furou um dia e a sequência é zero.
 */
export function currentStreak(
  progress: PracticeProgress,
  today: string,
): number {
  const last = progress.lastCompletedDay;
  if (!last) return 0;
  return last === today || last === addDays(today, -1) ? progress.streak : 0;
}

interface BuildInput {
  /** Baralho do aluno, na ordem do baralho. */
  student: Candidate[];
  /** Cartas dos baralhos de tópico que o aluno pode ver. */
  pool: Candidate[];
  progress: PracticeProgress;
  /** Injetado para o teste não depender da sorte. */
  random?: () => number;
}

export function buildMission({
  student,
  pool,
  progress,
  random = Math.random,
}: BuildInput): MissionCard[] {
  if (student.length === 0) {
    throw new Error('A missão precisa das palavras do aluno.');
  }

  const studentQueue = queue(student, progress, Infinity, false, random);
  const poolQueue = queue(pool, progress, MAX_POOL_RETRY, true, random);

  const studentPicks = studentQueue.splice(0, STUDENT_SLOTS);
  const poolPicks = poolQueue.splice(0, MISSION_SIZE - studentPicks.length);
  // Banco curto: as vagas que sobraram vão para as cartas do aluno.
  const missing = MISSION_SIZE - studentPicks.length - poolPicks.length;
  const fillers = studentQueue.splice(0, missing);

  const studentCards = [...studentPicks, ...fillers].map((c) =>
    toMissionCard(c, 'student'),
  );
  const poolCards = shuffle(
    poolPicks.map((c) => toMissionCard(c, 'topic')),
    random,
  );
  return interleave(poolCards, shuffle(studentCards, random), random);
}

/**
 * Ordem de prioridade de um conjunto: revisões (até `maxRetry`), nunca vistas
 * (sorteadas no banco, na ordem do baralho no aluno), e por fim as vistas há
 * mais tempo.
 */
function queue(
  candidates: Candidate[],
  progress: PracticeProgress,
  maxRetry: number,
  shuffleUnseen: boolean,
  random: () => number,
): Candidate[] {
  const byKey = new Map(candidates.map((c) => [c.key, c]));
  const retry = progress.retry
    .map((key) => byKey.get(key))
    .filter((c): c is Candidate => !!c)
    .slice(0, maxRetry);
  const retryKeys = new Set(progress.retry);

  const rest = candidates.filter((c) => !retryKeys.has(c.key));
  const unseen = rest.filter((c) => !progress.seen[c.key]);
  const seen = rest
    .filter((c) => progress.seen[c.key])
    .sort((a, b) =>
      progress.seen[a.key].day.localeCompare(progress.seen[b.key].day),
    );

  return [
    ...retry,
    ...(shuffleUnseen ? shuffle(unseen, random) : unseen),
    ...seen,
  ];
}

/**
 * Espalha as cartas do aluno entre as do banco, cada uma num vão diferente,
 * para as duas nunca ficarem vizinhas. Com o banco curto (mais cartas do aluno
 * que vãos) isso não é possível e o resto vai para o fim.
 */
function interleave(
  pool: MissionCard[],
  student: MissionCard[],
  random: () => number,
): MissionCard[] {
  const gaps = Array.from({ length: pool.length + 1 }, (_, i) => i);
  const chosen = shuffle(gaps, random).slice(
    0,
    Math.min(student.length, gaps.length),
  );
  const atGap = new Map<number, MissionCard>();
  chosen.forEach((gap, i) => atGap.set(gap, student[i]));
  const overflow = student.slice(chosen.length);

  const result: MissionCard[] = [];
  for (let i = 0; i <= pool.length; i++) {
    const s = atGap.get(i);
    if (s) result.push(s);
    if (i < pool.length) result.push(pool[i]);
  }
  return [...result, ...overflow];
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function toMissionCard(candidate: Candidate, source: CardSource): MissionCard {
  const { id: _id, ...card } = candidate.card;
  return { ...card, key: candidate.key, source };
}

export interface AnswerResult {
  day: MissionDay;
  progress: PracticeProgress;
  /** Presente só quando esta resposta completou a missão. */
  summary?: PracticeSummary | null;
  /** `false` = a carta já tinha resposta; nada foi alterado. */
  changed: boolean;
}

/**
 * Aplica uma resposta (§3.5). A primeira vale; repetir devolve o estado como
 * está. Completar a missão fixa a nota e atualiza média, mês e sequência.
 */
export function applyAnswer(
  day: MissionDay,
  progress: PracticeProgress,
  key: string,
  correct: boolean,
  now: string,
): AnswerResult {
  if (!day.cards.some((c) => c.key === key)) {
    throw new Error('Esta carta não está na missão de hoje.');
  }
  if (day.answers[key]) return { day, progress, changed: false };

  const answers = { ...day.answers, [key]: { correct, at: now } };
  const score = day.score + (correct ? 1 : 0);
  const complete = Object.keys(answers).length === day.cards.length;
  const nextDay: MissionDay = {
    ...day,
    answers,
    score,
    ...(complete ? { completedAt: now } : {}),
  };

  const retry = correct
    ? progress.retry.filter((k) => k !== key)
    : progress.retry.includes(key)
      ? progress.retry
      : [...progress.retry, key];

  let next: PracticeProgress = {
    ...progress,
    totalAnswered: progress.totalAnswered + 1,
    totalCorrect: progress.totalCorrect + (correct ? 1 : 0),
    seen: pruneSeen(
      { ...progress.seen, [key]: { day: day.day, correct } },
      day.day,
    ),
    retry,
  };

  if (!complete) return { day: nextDay, progress: next, changed: true };

  const streak = currentStreak(next, day.day) + 1;
  const month = day.day.slice(0, 7);
  const monthTotals = next.months[month] ?? { scoreSum: 0, missions: 0 };
  next = {
    ...next,
    streak,
    bestStreak: Math.max(next.bestStreak, streak),
    lastCompletedDay: day.day,
    scoreSum: next.scoreSum + score,
    missionsCompleted: next.missionsCompleted + 1,
    months: {
      ...next.months,
      [month]: {
        scoreSum: monthTotals.scoreSum + score,
        missions: monthTotals.missions + 1,
      },
    },
  };
  return {
    day: nextDay,
    progress: next,
    summary: practiceSummary(next),
    changed: true,
  };
}
