import { Injectable } from '@nestjs/common';
import { VideoRepository } from '../domain/repository.port';
import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import { Video } from '../domain/video.model';
import { instanceToPlain } from 'class-transformer';

@Injectable()
export class VideoFirestoreRepository implements VideoRepository {
  private readonly db: Firestore;
  collection = 'videos';
  constructor() {
    this.db = admin.firestore();
  }
  async save(video: Video, docId: string): Promise<void> {
    try {
      await this.db.collection(this.collection).doc(docId).set(instanceToPlain(video));
    } catch (error) {
      console.error('[Repository] Erro no Repositório ao salvar módulo de vídeo:', error);
      throw error;
    }
  }

  async getByLevel(level: string): Promise<Video[]> {
    const videosQuerySnapshot = await this.db
      .collection(this.collection)
      .where('level', '==', level)
      .get();
    if (!videosQuerySnapshot) {
      return [];
    }
    const videos: Video[] = videosQuerySnapshot.docs.map((doc) => {
      const data = doc.data();
      return new Video(data.index, data.level, data.topic);
    });
    return videos;
  }
}
