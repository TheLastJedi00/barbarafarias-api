import { VideoModule } from "./models/module.model";

export abstract class VideoRepository {
    abstract save(videoModule: VideoModule, docId: string): Promise<void>;
    abstract getByLevel(level: string): Promise<VideoModule[]>;
}