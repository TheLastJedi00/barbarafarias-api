import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { FIRESTORE } from '../firestore/firestore.module';
import { Article } from './article.entity';

@Injectable()
export class ArticleRepository {
  private readonly collection = 'articles';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /**
   * Lista do mais recente para o mais antigo. A ordenação é feita em memória:
   * a coleção é pequena (material de apoio curado pela gerente) e assim não
   * exige índice composto no Firestore.
   */
  async findAll(): Promise<Article[]> {
    const snapshot = await this.db.collection(this.collection).get();
    return snapshot.docs
      .map((doc) => this.toEntity(doc.id, doc.data()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findById(id: string): Promise<Article | null> {
    const doc = await this.db.collection(this.collection).doc(id).get();
    return doc.exists ? this.toEntity(doc.id, doc.data()!) : null;
  }

  async create(article: Article): Promise<Article> {
    const id = article.id ?? randomUUID();
    const created = new Article({ ...article, id });
    await this.db
      .collection(this.collection)
      .doc(id)
      .set(this.toPlain(created));
    return created;
  }

  async update(article: Article): Promise<void> {
    await this.db
      .collection(this.collection)
      .doc(article.id!)
      .set(this.toPlain(article), { merge: true });
  }

  async delete(id: string): Promise<void> {
    await this.db.collection(this.collection).doc(id).delete();
  }

  private toPlain(article: Article): Record<string, unknown> {
    return {
      title: article.title,
      content: article.content,
      coverImageUrl: article.coverImageUrl ?? null,
      authorId: article.authorId,
      authorName: article.authorName ?? null,
      authorRole: article.authorRole ?? null,
      status: article.status ?? null,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
    };
  }

  private toEntity(id: string, data: Record<string, any>): Article {
    return new Article({
      id,
      title: data.title ?? '',
      content: data.content ?? '',
      coverImageUrl: data.coverImageUrl ?? undefined,
      authorId: data.authorId ?? '',
      authorName: data.authorName ?? undefined,
      authorRole: data.authorRole ?? undefined,
      // Sem default: artigo da Fase 3 não tem `status`, e assumir `draft` aqui
      // esconderia da biblioteca material que sempre esteve no ar. Quem
      // resolve a ausência é o `statusOf` do service.
      status: data.status ?? undefined,
      createdAt: data.createdAt ?? '',
      updatedAt: data.updatedAt ?? data.createdAt ?? '',
    });
  }
}
