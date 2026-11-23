import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { todayInAppTimezone } from '../common/time';
import { CurriculumService } from '../curriculum/curriculum.service';
import { FlashcardDeckRepository } from '../flashcards/flashcard-deck.repository';
import { DeckProgress } from '../flashcards/deck-progress';
import {
  cardKey,
  FlashcardDeck,
  STUDENT_DECK_SIZE,
  studentDeckId,
  topicDeckId,
} from '../flashcards/flashcard.model';
import { FlashcardService } from '../flashcards/flashcard.service';
import { STORE_PRODUCT_KIND } from '../store/store-product.model';
import { isPurchaseActive } from '../store/store-purchase.model';
import { StorePurchaseRepository } from '../store/store-purchase.repository';
import { LEVELS, Level } from '../types/student.level';
import { hasPaidAccess } from '../users/paid-access';
import { User, USER_TIER } from '../users/user.entity';
import { UserRepository } from '../users/user.repository';
import {
  applyAnswer,
  buildMission,
  Candidate,
  currentStreak,
  MISSION_SIZE,
  MissionDay,
  practiceSummary,
  PracticeSummary,
} from './mission-builder';
import { PracticeRepository } from './practice.repository';

/** Geração do baralho do aluno começada há menos que isso ainda está de pé. */
const GENERATING_WINDOW_MS = 5 * 60 * 1000;

export const NO_PRACTICE_ACCESS =
  'Praticando em Casa é para alunos com plano ou módulo ativo.';

export interface PracticeStatus {
  available: boolean;
  pending: boolean;
  answered: number;
  total: number;
  streak: number;
  summary: PracticeSummary | null;
}

export interface MissionView extends MissionDay {
  streak: number;
  summary: PracticeSummary | null;
}

/** O baralho do aluno ainda está sendo gerado (fix 037): a tela mostra a barra. */
export interface DeckPendingView extends DeckProgress {
  generating: true;
}

export type TodayView = MissionView | DeckPendingView;

export interface AnswerView {
  score: number;
  answered: number;
  total: number;
  completed: boolean;
  streak: number;
  summary: PracticeSummary | null;
}

/**
 * A missão diária de flashcards (spec 037 §3). As regras moram no
 * `mission-builder`; aqui é ler o que o aluno pode ver, montar uma vez por dia
 * e gravar as respostas numa transação.
 */
@Injectable()
export class PracticeService {
  constructor(
    private readonly repo: PracticeRepository,
    private readonly decks: FlashcardDeckRepository,
    private readonly flashcards: FlashcardService,
    private readonly curriculum: CurriculumService,
    private readonly users: UserRepository,
    private readonly purchases: StorePurchaseRepository,
  ) {}

  /** Leve, para o header: não lê currículo nem baralho. */
  async status(uid: string): Promise<PracticeStatus> {
    const user = await this.users.findById(uid);
    const available = !!user && (await this.hasAccess(uid, user));
    const day = todayInAppTimezone();
    const [progress, mission] = await Promise.all([
      this.repo.getProgress(uid),
      available ? this.repo.getDay(uid, day) : Promise.resolve(null),
    ]);
    const answered = mission ? Object.keys(mission.answers).length : 0;
    const total = mission?.cards.length || MISSION_SIZE;
    return {
      available,
      pending: available && !mission?.completedAt,
      answered,
      total,
      streak: currentStreak(progress, day),
      summary: practiceSummary(progress),
    };
  }

  async today(uid: string): Promise<TodayView> {
    const user = await this.users.findById(uid);
    if (!user) throw new ForbiddenException(NO_PRACTICE_ACCESS);
    const deckIds = await this.eligibleTopicDecks(uid, user);
    if (deckIds === null) throw new ForbiddenException(NO_PRACTICE_ACCESS);

    const day = todayInAppTimezone();
    const [existing, progress] = await Promise.all([
      this.repo.getDay(uid, day),
      this.repo.getProgress(uid),
    ]);
    const view = (mission: MissionDay): MissionView => ({
      ...mission,
      streak: currentStreak(progress, day),
      summary: practiceSummary(progress),
    });
    if (existing) return view(existing);

    const [studentDeck, topicDecks] = await Promise.all([
      this.decks.findById(studentDeckId(uid)),
      this.decks.findMany(deckIds),
    ]);
    if (studentDeck?.status !== 'ready' || studentDeck.cards.length === 0) {
      return {
        generating: true,
        ...(await this.studentDeckProgress(uid, studentDeck)),
      };
    }
    const cards = buildMission({
      student: candidates(studentDeck),
      pool: topicDecks.filter((d) => d.status === 'ready').flatMap(candidates),
      progress,
    });
    const mission = await this.repo.createDay(uid, {
      day,
      cards,
      answers: {},
      score: 0,
    });
    return view(mission);
  }

  async answer(
    uid: string,
    key: string,
    correct: boolean,
  ): Promise<AnswerView> {
    const day = todayInAppTimezone();
    const now = new Date().toISOString();
    const result = await this.repo.answer(uid, day, (mission, progress) => {
      try {
        return applyAnswer(mission, progress, key, correct, now);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Resposta inválida.',
        );
      }
    });
    return {
      score: result.day.score,
      answered: Object.keys(result.day.answers).length,
      total: result.day.cards.length,
      completed: !!result.day.completedAt,
      streak: currentStreak(result.progress, day),
      summary: practiceSummary(result.progress),
    };
  }

  /**
   * O baralho do aluno pronto para a missão. Faltando ou com erro, gera agora
   * (rede de segurança dos alunos que já existiam e de geração que falhou).
   * Em geração recente, outra requisição já está nisso: pede para voltar.
   */
  /**
   * Andamento do baralho do aluno que ainda não está pronto. Geração recente
   * segue de pé e só tem o andamento lido; ausente, com erro ou travada
   * começa de novo em segundo plano — o pedido nunca espera a IA.
   */
  private async studentDeckProgress(
    uid: string,
    deck: FlashcardDeck | null,
  ): Promise<DeckProgress> {
    if (
      deck?.status === 'generating' &&
      Date.now() - Date.parse(deck.updatedAt) < GENERATING_WINDOW_MS
    ) {
      return deck.progress ?? { generated: 0, total: STUDENT_DECK_SIZE };
    }
    return this.flashcards.startStudentDeck(uid);
  }

  /**
   * Os baralhos de tópico que o aluno pode ver (§3.4): o nível inteiro para o
   * aluno do plano em dia; os módulos comprados e vigentes para o da loja.
   * `null` = sem acesso a Praticando em Casa.
   */
  private async eligibleTopicDecks(
    uid: string,
    user: User,
  ): Promise<string[] | null> {
    const ids = new Set<string>();
    let allowed = false;

    if (this.isPlanStudent(user)) {
      allowed = true;
      const level = levelOf(user);
      const curriculum = await this.curriculum.getLevel(level);
      curriculum.modules
        .flatMap((m) => m.topics)
        .filter((t) => !t.videoOnly)
        .forEach((t) => ids.add(topicDeckId(level, t.id)));
    }

    const modules = await this.activeModules(uid);
    if (modules.length > 0) allowed = true;
    const levels = [...new Set(modules.map((m) => m.level))];
    const curricula = await Promise.all(
      levels.map((level) => this.curriculum.getLevel(level)),
    );
    for (const { level, moduleId } of modules) {
      const curriculum = curricula[levels.indexOf(level)];
      curriculum.modules
        .find((m) => m.id === moduleId)
        ?.topics.filter((t) => !t.videoOnly)
        .forEach((t) => ids.add(topicDeckId(level, t.id)));
    }

    return allowed ? [...ids] : null;
  }

  private async hasAccess(uid: string, user: User): Promise<boolean> {
    if (this.isPlanStudent(user)) return true;
    return (await this.activeModules(uid)).length > 0;
  }

  private isPlanStudent(user: User): boolean {
    return user.tier !== USER_TIER.MODULES && hasPaidAccess(user);
  }

  private async activeModules(
    uid: string,
  ): Promise<{ level: Level; moduleId: string }[]> {
    const purchases = await this.purchases.findByUser(uid);
    return purchases
      .filter(
        (p) =>
          p.kind === STORE_PRODUCT_KIND.MODULE &&
          !!p.level &&
          !!p.moduleId &&
          isPurchaseActive(p),
      )
      .map((p) => ({ level: p.level!, moduleId: p.moduleId! }));
  }
}

function candidates(deck: FlashcardDeck): Candidate[] {
  return deck.cards.map((card) => ({ key: cardKey(deck.id, card.id), card }));
}

function levelOf(user: User): Level {
  return (LEVELS as readonly string[]).includes(user.level)
    ? (user.level as Level)
    : 'A1';
}
