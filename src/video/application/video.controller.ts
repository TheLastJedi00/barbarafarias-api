import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { VideoService } from './video.service';
import { Video } from '../domain/video.model';
import { VideoModuleDto } from '../domain/video.dto';
import { Roles } from 'src/auth/infrastructure/decorators/roles.decorator';

@Controller('video')
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
}
