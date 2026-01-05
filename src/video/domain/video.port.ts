import { VideoModule } from "./models/module.model";

export interface VideoRepository {
    save(videoModule: VideoModule, docId: string): Promise<void>;
    getByLevel(level: string): Promise<VideoModule[]>;
}