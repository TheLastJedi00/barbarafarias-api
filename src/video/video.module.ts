import { Module } from '@nestjs/common';
import { VideoService } from './application/video.service';
import { VideoFirestoreRepository } from './infrastructure/video.repository';

@Module({
  providers: [
    VideoService,
    {
      provide: 'VideoRepository',
      useClass: VideoFirestoreRepository,
    },
  ],
})
export class VideoModule {}
