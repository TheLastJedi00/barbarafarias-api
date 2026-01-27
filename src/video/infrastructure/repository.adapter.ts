import { Injectable, NotFoundException } from '@nestjs/common';
import { VideoRepository } from '../domain/repository.port';
import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import { Video } from '../domain/video.model';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { title } from 'process';
import { error } from 'console';

@Injectable()
export class VideoFirestoreRepository implements VideoRepository {
  private readonly db: Firestore;
  collection = 'videos';
  constructor() {
    this.db = admin.firestore();
  }

  async deleteByLevelAndIndexAndTopicAndYoutubeId(
    level: string,
    index: number,
    topic: string,
    youtubeId: string,
  ): Promise<void> {
    const snapshot = await this.db
      .collection(this.collection)
      .where('level', '==', level)
      .where('index', '==', index)
      .get();

    if (snapshot.empty) {
      throw new NotFoundException( `[Repository] Módulo de vídeo com nível ${level} e índice ${index} não encontrado para exclusão.`);
    }

    const supplyModel = plainToInstance(Video, snapshot.docs[0].data());

    const videoTopic = supplyModel.topic.find((t) => t.title === topic);
    if (!videoTopic) {
      throw new NotFoundException( `[Repository] Tópico ${topic} não encontrado no módulo ${index} do nível ${level} para exclusão.`);
    }

    videoTopic.videos = videoTopic.videos.filter((v) => v.youtubeId !== youtubeId);
    
    await snapshot.docs[0].ref.set(instanceToPlain(supplyModel));
  }

  async save(video: Video, docId: string): Promise<void> {
    try {
      await this.db
        .collection(this.collection)
        .doc(docId)
        .set(instanceToPlain(video));
    } catch (error) {
      console.error(
        '[Repository] Erro no Repositório ao salvar módulo de vídeo:',
        error,
      );
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
