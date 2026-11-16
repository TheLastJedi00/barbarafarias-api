import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { Level } from '../types/student.level';
import { VIDEO_LESSONS_COLLECTION } from '../video-lessons/video-lesson.collection';

/** O que o comprador da loja enxerga de material de apoio: só PDF (spec 032 decisão 10). */
export const STORE_READABLE_MIME = 'application/pdf';

export interface TopicContentCount {
  videos: number;
  pdfs: number;
}

/**
 * Leitura enxuta das vídeo aulas para a vitrine (spec 032). Mora aqui, e não
 * no módulo de vídeo aulas, porque é ele que vai depender da loja para decidir
 * o acesso — a mesma solução do currículo, que conta vídeos para a trava 409.
 */
@Injectable()
export class StoreContentRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /** Vídeos prontos e PDFs prontos de cada tópico do nível. */
  async countByTopic(level: Level): Promise<Map<string, TopicContentCount>> {
    const snapshot = await this.db
      .collection(VIDEO_LESSONS_COLLECTION)
      .where('level', '==', level)
      .select('topicId', 'status', 'materials')
      .get();

    const counts = new Map<string, TopicContentCount>();
    for (const doc of snapshot.docs) {
      if (doc.get('status') !== 'ready') continue;
      const topicId = doc.get('topicId') as string | undefined;
      if (!topicId) continue;
      const materials = (doc.get('materials') ?? []) as {
        mimeType?: string;
        status?: string;
      }[];
      const pdfs = materials.filter(
        (m) => m.status === 'ready' && m.mimeType === STORE_READABLE_MIME,
      ).length;
      const current = counts.get(topicId) ?? { videos: 0, pdfs: 0 };
      counts.set(topicId, {
        videos: current.videos + 1,
        pdfs: current.pdfs + pdfs,
      });
    }
    return counts;
  }
}
