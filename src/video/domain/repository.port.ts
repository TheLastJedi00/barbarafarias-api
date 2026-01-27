import { Video } from './video.model';

export abstract class VideoRepository {
  abstract save(video: Video, docId: string): Promise<void>;
  abstract getByLevel(level: string): Promise<Video[]>;
  abstract deleteByLevelAndIndexAndTopicAndYoutubeId(
    level: string,
    index: number,
    topic: string,
    youtubeId: string,
  ): Promise<void>;
}
