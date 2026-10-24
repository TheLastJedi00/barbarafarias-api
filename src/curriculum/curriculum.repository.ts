import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { Level } from '../types/student.level';
import { VIDEO_LESSONS_COLLECTION } from '../video-lessons/video-lesson.collection';
import {
  CurriculumModule,
  LevelCurriculum,
  PRINCIPAL_DOC_ID,
  PrincipalPrompt,
} from './curriculum.model';

/** Forma bruta do módulo no Firestore: `topics[].prompt` é o nome pré-020. */
interface StoredModule {
  id: string;
  title: string;
  context?: string;
  order: number;
  topics?: {
    id: string;
    order: number;
    title?: string;
    prompt?: string;
    videoOnly?: boolean;
  }[];
}

@Injectable()
export class CurriculumRepository {
  private readonly collection = 'curriculum';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async getPrincipal(): Promise<PrincipalPrompt | null> {
    const doc = await this.db
      .collection(this.collection)
      .doc(PRINCIPAL_DOC_ID)
      .get();
    if (!doc.exists) return null;
    return { prompt: doc.data()?.prompt ?? '' };
  }

  async upsertPrincipal(data: PrincipalPrompt): Promise<void> {
    await this.db
      .collection(this.collection)
      .doc(PRINCIPAL_DOC_ID)
      .set({ prompt: data.prompt }, { merge: true });
  }

  async getLevel(level: Level): Promise<LevelCurriculum | null> {
    const doc = await this.db.collection(this.collection).doc(level).get();
    if (!doc.exists) return null;
    const data = doc.data() ?? {};
    return {
      level,
      prompt: data.prompt ?? '',
      modules: this.readModules(data.modules),
    };
  }

  /**
   * Aceita os docs gravados antes da spec 020, quando o título do tópico morava
   * num campo chamado `prompt`. Evita script de migração: o doc antigo continua
   * legível e passa a gravar `title` no primeiro salvamento do painel.
   */
  private readModules(stored: StoredModule[] | undefined): CurriculumModule[] {
    return (stored ?? []).map((module) => ({
      id: module.id,
      title: module.title,
      context: module.context ?? '',
      order: module.order,
      topics: (module.topics ?? []).map((topic) => ({
        id: topic.id,
        title: topic.title ?? topic.prompt ?? '',
        order: topic.order,
        ...(topic.videoOnly ? { videoOnly: true } : {}),
      })),
    }));
  }

  /**
   * Quantas vídeo aulas cada tópico do nível tem (spec 027). Uma consulta de um
   * campo só — o projeto não publica índice composto — e o agrupamento em
   * memória: um nível tem dezenas de vídeos, não milhares.
   */
  async countVideosByTopic(level: Level): Promise<Map<string, number>> {
    const snapshot = await this.db
      .collection(VIDEO_LESSONS_COLLECTION)
      .where('level', '==', level)
      .select('topicId')
      .get();
    const counts = new Map<string, number>();
    for (const doc of snapshot.docs) {
      const topicId = doc.get('topicId') as string | undefined;
      if (topicId) counts.set(topicId, (counts.get(topicId) ?? 0) + 1);
    }
    return counts;
  }

  async upsertLevel(data: LevelCurriculum): Promise<void> {
    await this.db
      .collection(this.collection)
      .doc(data.level)
      .set(
        { level: data.level, prompt: data.prompt, modules: data.modules },
        { merge: false },
      );
  }
}
