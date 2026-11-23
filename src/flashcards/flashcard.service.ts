import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CurriculumService } from '../curriculum/curriculum.service';
import { GeminiProvider } from '../supply/gemini/gemini.service';
import { storeStudentInfo } from '../supply/prompts';
import { StudentInfo } from '../types/student.info';
import { LEVELS, Level } from '../types/student.level';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { FlashcardDeckRepository } from './flashcard-deck.repository';
import {
  FlashcardDeck,
  GeneratedDeckSchema,
  STUDENT_DECK_SIZE,
  studentDeckId,
  TOPIC_DECK_SIZE,
  toDeckCards,
  topicDeckId,
  wordKey,
} from './flashcard.model';
import { buildStudentDeckPrompt, buildTopicDeckPrompt } from './prompts';

/** Pede um pouco a mais: a IA repete palavra e o BE descarta. */
const TOPIC_REQUEST = 44;
const STUDENT_REQUEST = 72;
/** Abaixo disso a resposta é tratada como falha, não como baralho curto. */
const MIN_TOPIC_CARDS = 30;
const MIN_STUDENT_CARDS = 46;
/** Geração "em andamento" há mais que isso travou (a função caiu no meio). */
const STUCK_AFTER_MS = 5 * 60 * 1000;
const TEMPERATURE = 0.6;

export type TopicDeckStatus = 'missing' | FlashcardDeck['status'];

/** Uma linha do Prompt Manager: o tópico e o estado do baralho dele. */
export interface TopicDeckSummary {
  moduleId: string;
  topicId: string;
  title: string;
  status: TopicDeckStatus;
  /** O tópico foi renomeado depois da geração. */
  stale: boolean;
  cardCount: number;
  generatedAt?: string;
  error?: string;
}

export interface StudentDeckSummary {
  status: TopicDeckStatus;
  cardCount: number;
  generatedAt?: string;
  error?: string;
  /** Tem objetivo ou questionário para gerar. */
  hasContext: boolean;
}

/**
 * Dados do aluno para o prompt: objetivo + prognóstico (aluno do plano) ou as
 * 3 respostas do questionário (comprador da loja). Sem nenhum dos dois, não há
 * do que tirar palavras "do aluno".
 */
export function studentContext(user: User): StudentInfo | null {
  if (user.objective?.trim()) {
    return {
      firstName: user.fullName.trim().split(' ')[0] ?? '',
      objectives: user.objective.trim(),
      prognosis: user.prognosis?.trim() ?? '',
    };
  }
  if (user.careerProfile) {
    return storeStudentInfo(user.fullName, user.careerProfile);
  }
  return null;
}

function levelOf(user: User): Level {
  return (LEVELS as readonly string[]).includes(user.level)
    ? (user.level as Level)
    : 'A1';
}

@Injectable()
export class FlashcardService {
  private readonly logger = new Logger(FlashcardService.name);

  constructor(
    private readonly decks: FlashcardDeckRepository,
    private readonly curriculum: CurriculumService,
    private readonly users: UserService,
    private readonly gemini: GeminiProvider,
  ) {}

  /** Gera (ou regera) o baralho de um tópico. Tópico só de vídeo não tem baralho. */
  async generateTopicDeck(
    level: Level,
    topicId: string,
  ): Promise<FlashcardDeck> {
    const [levelCurriculum, flashcards] = await Promise.all([
      this.curriculum.getLevel(level),
      this.curriculum.getFlashcardsPrompt(),
    ]);
    const module = levelCurriculum.modules.find((m) =>
      m.topics.some((t) => t.id === topicId && !t.videoOnly),
    );
    const topic = module?.topics.find((t) => t.id === topicId);
    if (!module || !topic) {
      throw new NotFoundException('Tópico não encontrado neste nível.');
    }

    const id = topicDeckId(level, topicId);
    await this.decks.markGenerating({
      id,
      kind: 'topic',
      level,
      moduleId: module.id,
      topicId,
    });

    const prompt = buildTopicDeckPrompt({
      flashcardsPrompt: flashcards.prompt,
      levelPrompt: levelCurriculum.prompt,
      level,
      moduleTitle: module.title,
      moduleContext: module.context,
      topicTitle: topic.title,
      count: TOPIC_REQUEST,
    });
    return this.generate(id, prompt, TOPIC_DECK_SIZE, MIN_TOPIC_CARDS, {
      sourceTitle: topic.title,
    });
  }

  /** Gera (ou regera) as 62 palavras do aluno, sem as que já estão nos tópicos do nível. */
  async generateStudentDeck(studentId: string): Promise<FlashcardDeck> {
    const user = await this.users.findById(studentId);
    const student = studentContext(user);
    if (!student) {
      throw new UnprocessableEntityException(
        'O aluno ainda não tem objetivo nem questionário respondido para gerar as palavras dele.',
      );
    }
    const level = levelOf(user);

    const id = studentDeckId(studentId);
    await this.decks.markGenerating({ id, kind: 'student', studentId });

    const [levelCurriculum, flashcards, topicDecks] = await Promise.all([
      this.curriculum.getLevel(level),
      this.curriculum.getFlashcardsPrompt(),
      this.decks.findTopicDecksByLevel(level),
    ]);
    const exclude = new Set(
      topicDecks.flatMap((d) => d.cards.map((c) => wordKey(c.english))),
    );

    const prompt = buildStudentDeckPrompt({
      flashcardsPrompt: flashcards.prompt,
      levelPrompt: levelCurriculum.prompt,
      level,
      student,
      count: STUDENT_REQUEST,
    });
    return this.generate(id, prompt, STUDENT_DECK_SIZE, MIN_STUDENT_CARDS, {
      exclude,
    });
  }

  /**
   * Garante que o aluno tem baralho, sem regerar o que existe. Usada na
   * matrícula e como rede de segurança no primeiro acesso. `true` = gerou.
   */
  async ensureStudentDeck(studentId: string): Promise<boolean> {
    const current = await this.decks.findById(studentDeckId(studentId));
    if (current?.status === 'ready') return false;
    if (
      current?.status === 'generating' &&
      Date.now() - Date.parse(current.updatedAt) < STUCK_AFTER_MS
    ) {
      return false;
    }
    await this.generateStudentDeck(studentId);
    return true;
  }

  /**
   * Estado dos baralhos de um nível para o Prompt Manager. Tópico sem baralho
   * aparece como `missing`; baralho de tópico removido (ou que virou só de
   * vídeo) é apagado aqui — é o único lugar que compara as duas listas.
   */
  async listTopicDecks(level: Level): Promise<TopicDeckSummary[]> {
    const [levelCurriculum, decks] = await Promise.all([
      this.curriculum.getLevel(level),
      this.decks.findTopicDecksByLevel(level),
    ]);
    const byTopic = new Map(decks.map((d) => [d.topicId, d]));

    const summaries: TopicDeckSummary[] = [];
    const kept = new Set<string>();
    for (const module of levelCurriculum.modules) {
      for (const topic of module.topics) {
        if (topic.videoOnly) continue;
        const deck = byTopic.get(topic.id);
        if (deck) kept.add(deck.id);
        summaries.push({
          moduleId: module.id,
          topicId: topic.id,
          title: topic.title,
          status: deck?.status ?? 'missing',
          stale:
            !!deck?.sourceTitle &&
            deck.status === 'ready' &&
            deck.sourceTitle !== topic.title,
          cardCount: deck?.cards.length ?? 0,
          generatedAt: deck?.generatedAt,
          error: deck?.error,
        });
      }
    }

    const orphans = decks.filter((d) => !kept.has(d.id)).map((d) => d.id);
    if (orphans.length > 0) await this.decks.deleteMany(orphans);
    return summaries;
  }

  async getStudentDeckSummary(studentId: string): Promise<StudentDeckSummary> {
    const [user, deck] = await Promise.all([
      this.users.findById(studentId),
      this.decks.findById(studentDeckId(studentId)),
    ]);
    return {
      status: deck?.status ?? 'missing',
      cardCount: deck?.cards.length ?? 0,
      generatedAt: deck?.generatedAt,
      error: deck?.error,
      hasContext: studentContext(user) !== null,
    };
  }

  private async generate(
    id: string,
    prompt: string,
    size: number,
    min: number,
    options: { sourceTitle?: string; exclude?: Set<string> },
  ): Promise<FlashcardDeck> {
    try {
      const { cards: generated } = await this.gemini.generateJson(
        prompt,
        GeneratedDeckSchema,
        { temperature: TEMPERATURE },
      );
      const cards = toDeckCards(generated, size, options.exclude);
      if (cards.length < min) {
        throw new Error(
          `A IA devolveu ${cards.length} palavras aproveitáveis; o mínimo é ${min}.`,
        );
      }
      await this.decks.saveCards(id, cards, options.sourceTitle);
      const now = new Date().toISOString();
      return {
        id,
        kind: id.startsWith('student_') ? 'student' : 'topic',
        status: 'ready',
        cards,
        sourceTitle: options.sourceTitle,
        generatedAt: now,
        updatedAt: now,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha ao gerar as cartas.';
      this.logger.error(`Baralho ${id}: ${message}`);
      await this.decks.markError(id, message);
      throw new UnprocessableEntityException(
        'Não foi possível gerar os flashcards agora. Tente de novo em instantes.',
      );
    }
  }
}
