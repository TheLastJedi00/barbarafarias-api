import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { Level } from '../types/student.level';
import {
  LevelCurriculum,
  PRINCIPAL_DOC_ID,
  PrincipalPrompt,
} from './curriculum.model';

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
      modules: data.modules ?? [],
    };
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
