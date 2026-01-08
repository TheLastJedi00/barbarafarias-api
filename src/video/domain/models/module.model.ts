import { Type } from "class-transformer";
import { VideoTopic } from "./topic.model";
import { IsEnum } from "class-validator";

export enum VideoLevel {
    A1 = 'A1',
    A2 = 'A2',
    B1 = 'B1',
    B2 = 'B2',
}
export class VideoModule {
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

