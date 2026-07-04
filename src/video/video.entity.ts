import { Type } from "class-transformer";
import { IsEnum } from "class-validator";
import { LEVELS, type Level } from "../types/student.level";

export class Video {
    index: number;
    @IsEnum(LEVELS)
    level: Level;
    @Type(() => VideoTopic) //Mapper Field by Field
    topic: VideoTopic[];

    constructor(index: number, level: string, topic: VideoTopic[]) {
        this.index = index;
        this.level = level as Level;
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
}

