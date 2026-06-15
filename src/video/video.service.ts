import { Injectable, NotFoundException } from '@nestjs/common';
import { VideoModuleDto } from './dtos/video.dto';
import { VideoRepository } from './video.repository';
import { plainToInstance } from 'class-transformer';
import { Video } from './video.entity';

@Injectable()
export class VideoService {
  constructor(
    private readonly videoRepository: VideoRepository,
  ) {}

  async saveVideoModule(data: VideoModuleDto) {
    try {
      const docId = `${data.level}_${data.index}`;
      const entity = plainToInstance(Video, data);
      await this.videoRepository.save(entity, docId);
    } catch (error) {
      console.error('[Service] Erro ao salvar módulo de vídeo:', error);
      throw error;
    }
  }

  async getVideosByLevel(level: string): Promise<Video[]> {
    try {
      const data = await this.videoRepository.getByLevel(level);
      if (!data || data.length === 0) {
        throw new NotFoundException(`Módulo de nível ${level} não encontrado.`);
      }
      return data;
    } catch (error) {
      console.error(
        '[Service] Erro ao buscar módulos de vídeo por nível:',
        error,
      );
      throw error;
    }
  }

  async deleteVideo(
    level: string,
    index: number,
    topic: string,
    youtubeId: string,
  ): Promise<void> {
    try {
      await this.videoRepository.deleteByLevelAndIndexAndTopicAndYoutubeId(
        level,
        index,
        topic,
        youtubeId,
      );
    } catch (error) {
      console.error('[Service] Erro ao deletar vídeo:', error);
      throw error;
    }
  }
}
