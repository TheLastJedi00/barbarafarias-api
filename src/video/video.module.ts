import { Module } from '@nestjs/common';
import { VideoService } from './application/video.service';
import { VideoFirestoreRepository } from './infrastructure/video.repository';
import { VideoController } from './application/video.controller';
import { VideoRepository } from './domain/video.port';

@Module({
  providers: [
    VideoService,
    {
      provide: VideoRepository,
      useClass: VideoFirestoreRepository,
    },
  ],
  controllers: [VideoController],
})
export class VideoModule {}
