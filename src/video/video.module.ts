import { Module } from '@nestjs/common';
import { VideoService } from './video.service';
import { VideoController } from './video.controller';
import { VideoRepository } from './video.repository';

@Module({
  providers: [VideoService, VideoRepository],
  controllers: [VideoController],
})
export class VideoModule {}
