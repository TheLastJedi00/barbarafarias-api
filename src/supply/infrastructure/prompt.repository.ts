import { Firestore } from 'firebase-admin/firestore';
import { PromptRepository } from '../domain/prompt.repository.port';
import { Prompt } from '../domain/models/prompt.model';
import * as admin from 'firebase-admin';
import { Level } from '../domain/types/student.level';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PromptFirestoreRepository implements PromptRepository {
  private readonly db: Firestore;
  private readonly collectionName = 'prompts';
  constructor() {
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
