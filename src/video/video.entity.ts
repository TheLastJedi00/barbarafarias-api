import { Type } from "class-transformer";
import { IsEnum } from "class-validator";

export enum VideoLevel {
    A1 = 'A1',
    A2 = 'A2',
    B1 = 'B1',
    B2 = 'B2',
}
export class Video {
    index: number;
    @IsEnum(VideoLevel)
    level: VideoLevel;
    @Type(() => VideoTopic) //Mapper Field by Field
    topic: VideoTopic[];

    constructor(index: number, level: string, topic: VideoTopic[]) {
        this.index = index;
        this.level = level as VideoLevel;
        this.topic = topic;
    }
}

export class VideoTopic {
    title: string;
    description: string;
    @Type(() => VideoInfo)
    videos: VideoInfo[];

    constructor(title: string, description: string, videos: VideoInfo[]) {
        this.title = title;
        this.description = description;
        this.videos = videos;
    }
}

export class VideoInfo {
    youtubeId: string;
    title: string
    internalHash: string;
    order: number;

    constructor(youtubeId: string, title: string, internalHash: string, order: number) {
        this.youtubeId = youtubeId;
        this.title = title;
        this.internalHash = internalHash;
        this.order = order;
    }

    delete(){
        this.youtubeId = '';
        this.title = '';
        this.internalHash = '';
        this.order = -1;
    }
}

