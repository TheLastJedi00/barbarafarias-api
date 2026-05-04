import { Body, Controller, Delete, Get, Param, Post, ParseIntPipe } from '@nestjs/common';
import { VideoService } from './video.service';
import { Video } from './video.entity';
import { VideoModuleDto } from './dtos/video.dto';
import { Roles } from '../decorators/roles.decorator';

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
        @Param('index', ParseIntPipe) index: number,
        @Param('topic') topic: string,
        @Param('youtubeId') youtubeId: string,
    ): Promise<void> {
        return this.videoService.deleteVideo(level, index, topic, youtubeId);
    }
}
