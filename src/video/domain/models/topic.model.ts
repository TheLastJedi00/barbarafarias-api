import { Type } from "class-transformer";
import { Video } from "./video.model";

export class VideoTopic {
    title: string;
    description: string;
    @Type(() => Video)
    videos: Video[];

    constructor(title: string, description: string, videos: Video[]) {
        this.title = title;
        this.description = description;
        this.videos = videos;
    }
}