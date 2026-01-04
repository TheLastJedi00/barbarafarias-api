import { Module } from '@nestjs/common';
import { VideoService } from './application/video.service';

@Module({
  providers: [VideoService]
})
export class VideoModule {}
