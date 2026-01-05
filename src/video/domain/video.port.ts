import { VideoModule } from "./models/module.model";

export interface VideoRepository {
    save(videoModule: VideoModule): Promise<void>;
    getByLevel(level: string): Promise<VideoModule[]>;
}