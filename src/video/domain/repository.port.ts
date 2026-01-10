import { Video } from "./video.model";

export abstract class VideoRepository {
    abstract save(video: Video, docId: string): Promise<void>;
    abstract getByLevel(level: string): Promise<Video[]>;
}