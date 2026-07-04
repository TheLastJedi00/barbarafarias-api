import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { Level } from '../types/student.level';
import { Inject, Injectable } from '@nestjs/common';
import { Prompt } from './prompt.model';

@Injectable()
export class PromptRepository {
  private readonly collectionName = 'prompts';
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}
  async getPromptByLevel(level: Level): Promise<Prompt | null> {
    const snapshot = await this.db
      .collection(this.collectionName)
      .where('level', '==', level)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    const data = doc.data();
    return new Prompt(level, data.prompt);
  }
}
