import { Injectable } from '@nestjs/common';
import { VideoModuleDto } from '../domain/dto/module.dto';
import type { VideoRepository } from '../domain/video.port';
import { plainToInstance } from 'class-transformer';
import { VideoModule } from '../domain/models/module.model';

@Injectable()
export class VideoService {
  constructor(private videoRepository: VideoRepository) {}

  async saveVideoModule(data: VideoModuleDto) {
    try {
      const docId = `${data.level}_${data.index}`;
      const entity = plainToInstance(VideoModule, data);
      await this.videoRepository.save(entity, docId);
    } catch (error) {
      console.error('[Service] Erro ao salvar módulo de vídeo:', error);
      throw error;
    }
  }

  async getVideosByLevel(level: string): Promise<VideoModule[]> {
    try {
      return await this.videoRepository.getByLevel(level);
    } catch (error) {
      console.error(
        '[Service] Erro ao buscar módulos de vídeo por nível:',
        error,
      );
      throw error;
    }
  }
}
