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
    const docId = `${data.level}_${data.index}`;
    const entity = plainToInstance(Video, data);
    await this.videoRepository.save(entity, docId);
  }

  async getVideosByLevel(level: string): Promise<Video[]> {
    const data = await this.videoRepository.getByLevel(level);
    if (!data || data.length === 0) {
      throw new NotFoundException(`Módulo de nível ${level} não encontrado.`);
    }
    return data;
  }

  async deleteVideo(
    level: string,
    index: number,
    topic: string,
    youtubeId: string,
  ): Promise<void> {
    await this.videoRepository.deleteByLevelAndIndexAndTopicAndYoutubeId(
      level,
      index,
      topic,
      youtubeId,
    );
  }
}
