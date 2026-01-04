import { VideoTopic } from "./topic.model";

export class VideoModule {
    index: number;
    topic: VideoTopic[];

    constructor(index: number, topic: VideoTopic[]) {
        this.index = index;
        this.topic = topic;
    }
}