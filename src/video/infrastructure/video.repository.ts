import { Injectable } from '@nestjs/common';
import { VideoRepository } from '../domain/video.port';
import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import { VideoModule } from '../domain/models/module.model';
import { instanceToPlain } from 'class-transformer';

@Injectable()
export class VideoFirestoreRepository implements VideoRepository {
  private readonly db: Firestore;
  collection = 'videos';
  constructor() {
    this.db = admin.firestore();
  }
  async save(videoModule: VideoModule, docId: string): Promise<void> {
    try {
      await this.db.collection(this.collection).doc(docId).set(instanceToPlain(videoModule));
    } catch (error) {
      console.error('[Repository] Erro no Repositório ao salvar módulo de vídeo:', error);
      throw error;
    }
  }

  async getByLevel(level: string): Promise<VideoModule[]> {
    const videosQuerySnapshot = await this.db
      .collection(this.collection)
      .where('level', '==', level)
      .get();
    if (!videosQuerySnapshot) {
      return [];
    }
    const videoModules: VideoModule[] = videosQuerySnapshot.docs.map((doc) => {
      const data = doc.data();
      return new VideoModule(data.index, data.level, data.topic);
    });
    return videoModules;
  }
}
