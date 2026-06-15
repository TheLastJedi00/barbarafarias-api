import { Firestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { Level } from '../types/student.level';
import { Injectable } from '@nestjs/common';
import { Prompt } from './prompt.model';

@Injectable()
export class PromptRepository {
  private readonly db: Firestore;
  private readonly collectionName = 'prompts';
  constructor() {
    this.db = admin.firestore();
  }
  async getPromptByLevel(level: Level): Promise<Prompt | null> {
    try {
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
    } catch (error) {
      console.error('Error fetching prompt by level:', error);
      throw error;
    }
  }
}
