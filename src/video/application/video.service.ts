import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { VideoModuleDto } from '../domain/video.dto';
import { VideoRepository } from '../domain/repository.port';
import { plainToInstance } from 'class-transformer';
import { Video } from '../domain/video.model';

@Injectable()
export class VideoService {
  @Inject(VideoRepository)
  private readonly videoRepository: VideoRepository;

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
      if(data === null ) {throw new NotFoundException(`Módulo de nível ${level} não encontrado.`)};
      return data;
    } catch (error) {
      console.error(
        '[Service] Erro ao buscar módulos de vídeo por nível:',
        error,
      );
      throw error;
    }
  }
}
