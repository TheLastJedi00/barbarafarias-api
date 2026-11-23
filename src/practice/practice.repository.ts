import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import {
  AnswerResult,
  emptyProgress,
  MissionDay,
  PracticeProgress,
} from './mission-builder';

/** Progresso em `practice/{uid}`, missões em `practice/{uid}/days/{YYYY-MM-DD}`. */
export const PRACTICE_COLLECTION = 'practice';
const DAYS = 'days';
const USERS = 'users';

@Injectable()
export class PracticeRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async getProgress(uid: string): Promise<PracticeProgress> {
    const doc = await this.progressRef(uid).get();
    return this.readProgress(doc.exists ? doc.data() : undefined);
  }

  async getDay(uid: string, day: string): Promise<MissionDay | null> {
    const doc = await this.dayRef(uid, day).get();
    return doc.exists ? (doc.data() as MissionDay) : null;
  }

  /**
   * Grava a missão do dia se ainda não existir. Duas abas abrindo ao mesmo
   * tempo montam duas missões, mas só a primeira fica: a outra recebe a que
   * ganhou a corrida.
   */
  async createDay(uid: string, mission: MissionDay): Promise<MissionDay> {
    const ref = this.dayRef(uid, mission.day);
    return this.db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) return existing.data() as MissionDay;
      tx.create(ref, mission);
      return mission;
    });
  }

  /**
   * Lê o dia e o progresso, aplica a resposta e grava tudo junto. Quando a
   * resposta completa a missão, a média vai também para `users/{uid}`, que é
   * de onde o card do aluno e as aulas da professora a leem.
   */
  async answer(
    uid: string,
    day: string,
    apply: (day: MissionDay, progress: PracticeProgress) => AnswerResult,
  ): Promise<AnswerResult> {
    const dayRef = this.dayRef(uid, day);
    const progressRef = this.progressRef(uid);
    return this.db.runTransaction(async (tx) => {
      const [daySnap, progressSnap] = await Promise.all([
        tx.get(dayRef),
        tx.get(progressRef),
      ]);
      if (!daySnap.exists) {
        throw new NotFoundException('A missão de hoje ainda não foi montada.');
      }
      const result = apply(
        daySnap.data() as MissionDay,
        this.readProgress(
          progressSnap.exists ? progressSnap.data() : undefined,
        ),
      );
      if (!result.changed) return result;

      tx.set(dayRef, result.day);
      tx.set(progressRef, result.progress);
      if (result.summary) {
        tx.set(
          this.db.collection(USERS).doc(uid),
          { practiceSummary: result.summary },
          { merge: true },
        );
      }
      return result;
    });
  }

  private readProgress(
    data: FirebaseFirestore.DocumentData | undefined,
  ): PracticeProgress {
    return {
      ...emptyProgress(),
      ...((data ?? {}) as Partial<PracticeProgress>),
    };
  }

  private progressRef(uid: string) {
    return this.db.collection(PRACTICE_COLLECTION).doc(uid);
  }

  private dayRef(uid: string, day: string) {
    return this.progressRef(uid).collection(DAYS).doc(day);
  }
}
