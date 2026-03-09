import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { VideoService } from './video.service';
import { Video } from '../domain/video.model';
import { VideoModuleDto } from '../domain/video.dto';
import { Roles } from 'src/auth/infrastructure/decorators/roles.decorator';

@Controller('videos')
export class VideoController {
    constructor(private videoService: VideoService){}

    @Get('/:level')
    async getVideoModuleByLevel(@Param('level') level: string): Promise<Video[]> {
        return this.videoService.getVideosByLevel(level);
    }

    @Post()
    @Roles('teacher')
    async createOrUpdateVideoModule(@Body() data: VideoModuleDto): Promise<void>{
        return this.videoService.saveVideoModule(data);
    }

    @Delete(":level/:index/:topic/:youtubeId")
    @Roles('teacher')
    async deleteVideo(
        @Param('level') level: string,
        @Param('index') index: number,
        @Param('topic') topic: string,
        @Param('youtubeId') youtubeId: string,
    ): Promise<void> {
        return this.videoService.deleteVideo(level, index, topic, youtubeId);
    }
}
