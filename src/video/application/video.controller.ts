import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { VideoService } from './video.service';
import { VideoModule } from '../domain/models/module.model';
import { VideoModuleDto } from '../domain/dto/module.dto';

@Controller('video')
export class VideoController {
    constructor(private videoService: VideoService){}

    @Get('/:level')
    async getVideoModuleByLevel(@Param('level') level: string): Promise<VideoModule[]> {
        return this.videoService.getVideosByLevel(level);
    }

    @Post()
    async createOrUpdateVideoModule(@Body() data: VideoModuleDto): Promise<void>{
        return this.videoService.saveVideoModule(data);
    }
}
