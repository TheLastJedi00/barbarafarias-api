import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { Level } from '../types/student.level';
import type { DeckProgress } from './deck-progress';
import {
  Flashcard,
  FLASHCARD_DECKS_COLLECTION,
  FlashcardDeck,
} from './flashcard.model';

/** Campos fixos de um baralho, gravados quando ele começa a ser gerado. */
export type DeckIdentity = Pick<
  FlashcardDeck,
  'id' | 'kind' | 'level' | 'moduleId' | 'topicId' | 'studentId'
>;

@Injectable()
export class FlashcardDeckRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async findById(id: string): Promise<FlashcardDeck | null> {
    const doc = await this.collection().doc(id).get();
    return doc.exists ? this.read(doc.id, doc.data()!) : null;
  }

  /** Vários baralhos numa leitura só; os que não existem ficam de fora. */
  async findMany(ids: string[]): Promise<FlashcardDeck[]> {
    if (ids.length === 0) return [];
    const refs = [...new Set(ids)].map((id) => this.collection().doc(id));
    const docs = await this.db.getAll(...refs);
    return docs
      .filter((doc) => doc.exists)
      .map((doc) => this.read(doc.id, doc.data()!));
  }

  /**
   * Baralhos de tópico de um nível. Só o de tópico tem `level`, então um filtro
   * de um campo basta (o projeto não publica índice composto).
   */
  async findTopicDecksByLevel(level: Level): Promise<FlashcardDeck[]> {
    const snapshot = await this.collection().where('level', '==', level).get();
    return snapshot.docs.map((doc) => this.read(doc.id, doc.data()));
  }

  /** Marca o início da geração, sem apagar as cartas antigas (regerar não deixa o baralho vazio). */
  async markGenerating(
    identity: DeckIdentity,
    progress?: DeckProgress,
  ): Promise<void> {
    await this.collection()
      .doc(identity.id)
      .set(
        {
          ...identity,
          status: 'generating',
          ...(progress ? { progress } : {}),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
  }

  /** Andamento durante a geração (fix 037). Não mexe no status. */
  async saveProgress(id: string, progress: DeckProgress): Promise<void> {
    await this.collection()
      .doc(id)
      .set({ progress, updatedAt: new Date().toISOString() }, { merge: true });
  }

  async saveCards(
    id: string,
    cards: Flashcard[],
    sourceTitle?: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.collection()
      .doc(id)
      .set(
        {
          status: 'ready',
          cards,
          ...(sourceTitle !== undefined ? { sourceTitle } : {}),
          generatedAt: now,
          updatedAt: now,
          error: null,
          progress: { generated: cards.length, total: cards.length },
        },
        { merge: true },
      );
  }

  async markError(id: string, message: string): Promise<void> {
    await this.collection().doc(id).set(
      {
        status: 'error',
        error: message,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  /**
   * Ouve um baralho (fix 037): o primeiro aviso é o estado atual, os outros
   * são as mudanças. Ausente chega como `null`. Devolve o cancelamento.
   */
  watchDeck(
    id: string,
    onChange: (deck: FlashcardDeck | null) => void,
    onError: (error: Error) => void,
  ): () => void {
    return this.collection()
      .doc(id)
      .onSnapshot(
        (doc) => onChange(doc.exists ? this.read(doc.id, doc.data()!) : null),
        onError,
      );
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const batch = this.db.batch();
    ids.forEach((id) => batch.delete(this.collection().doc(id)));
    await batch.commit();
  }

  private read(id: string, raw: FirebaseFirestore.DocumentData): FlashcardDeck {
    const data = raw as Partial<FlashcardDeck> & { error?: string | null };
    return {
      id,
      kind: data.kind ?? 'topic',
      status: data.status ?? 'generating',
      cards: data.cards ?? [],
      level: data.level,
      moduleId: data.moduleId,
      topicId: data.topicId,
      sourceTitle: data.sourceTitle,
      studentId: data.studentId,
      generatedAt: data.generatedAt,
      updatedAt: data.updatedAt ?? '',
      error: data.error ?? undefined,
      progress: data.progress,
    };
  }

  private collection() {
    return this.db.collection(FLASHCARD_DECKS_COLLECTION);
  }
}
