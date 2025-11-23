import { Firestore } from 'firebase-admin/firestore';
import { PromptRepository } from '../infrastructure/prompt.repository';
import { Prompt } from './models/prompt.model';
import * as admin from 'firebase-admin';
import { Level } from './types/student.level';

export class PromptFirestoreRepository implements PromptRepository {
  private readonly db: Firestore;
  private readonly collectionName = 'prompts';
  constructor(db: Firestore) {
    this.db = admin.firestore();
  }
  async getPromptByLevel(level: Level): Promise<Prompt | null> {
    try {
      const doc = await this.db
        .collection(this.collectionName)
        .doc(level.toString())
        .get();
      if (!doc.exists) {
        return null;
      }
      const data = doc.data();
      return new Prompt(level, data!.prompt);
    } catch (error) {
      console.error('Error fetching prompt by level:', error);
      throw error;
    }
  }
}
