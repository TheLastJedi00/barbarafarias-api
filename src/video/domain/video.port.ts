import { VideoModule } from "./models/module.model";

export interface VideoRepository {
    getVideoByLevel(level: string): Promise<VideoModule[]>;
}