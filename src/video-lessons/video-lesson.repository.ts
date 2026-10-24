import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { Level } from '../types/student.level';
import { VIDEO_LESSONS_COLLECTION } from './video-lesson.collection';
import { VideoLesson } from './video-lesson.model';

/**
 * Coleção `videoLessons`, um doc por vídeo (spec 027).
 *
 * Toda consulta usa **um campo só** — o projeto não publica índice composto —
 * e a ordenação é feita em memória: um nível tem dezenas de vídeos.
 */
@Injectable()
export class VideoLessonRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  newId(): string {
    return this.collection().doc().id;
  }

  async findById(id: string): Promise<VideoLesson | null> {
    const doc = await this.collection().doc(id).get();
    return doc.exists ? this.toEntity(doc.id, doc.data()!) : null;
  }

  async findByLevel(level: Level): Promise<VideoLesson[]> {
    const snapshot = await this.collection().where('level', '==', level).get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  async findByTopic(topicId: string): Promise<VideoLesson[]> {
    const snapshot = await this.collection()
      .where('topicId', '==', topicId)
      .get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  /** Fallback do webhook quando o asset chega sem `passthrough`. */
  async findByAssetId(assetId: string): Promise<VideoLesson | null> {
    const snapshot = await this.collection()
      .where('mux.assetId', '==', assetId)
      .limit(1)
      .get();
    const doc = snapshot.docs[0];
    return doc ? this.toEntity(doc.id, doc.data()) : null;
  }

  async save(lesson: VideoLesson): Promise<void> {
    const { id, ...data } = lesson;
    // JSON round-trip: o Firestore recusa `undefined`, e os campos opcionais
    // (mux, errorMessage) ficam simplesmente ausentes até existirem.
    await this.collection()
      .doc(id)
      .set(JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
  }

  /** Grava a ordem de vários vídeos de uma vez (reordenação no tópico). */
  async saveOrders(
    orders: { id: string; order: number }[],
    updatedAt: string,
  ): Promise<void> {
    const batch = this.db.batch();
    for (const { id, order } of orders) {
      batch.update(this.collection().doc(id), { order, updatedAt });
    }
    await batch.commit();
  }

  async delete(id: string): Promise<void> {
    await this.collection().doc(id).delete();
  }

  private collection() {
    return this.db.collection(VIDEO_LESSONS_COLLECTION);
  }

  private toEntity(id: string, data: Record<string, any>): VideoLesson {
    return {
      id,
      level: data.level,
      topicId: data.topicId ?? '',
      title: data.title ?? '',
      description: data.description ?? '',
      order: data.order ?? 0,
      status: data.status,
      source: data.source,
      ...(data.mux ? { mux: data.mux } : {}),
      ...(data.errorMessage ? { errorMessage: data.errorMessage } : {}),
      materials: data.materials ?? [],
      createdBy: data.createdBy ?? '',
      createdAt: data.createdAt ?? '',
      updatedAt: data.updatedAt ?? data.createdAt ?? '',
    };
  }
}
