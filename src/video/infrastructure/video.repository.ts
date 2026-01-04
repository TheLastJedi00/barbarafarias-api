import { Injectable, NotFoundException } from "@nestjs/common";
import { VideoRepository } from "../domain/video.port";
import * as admin from 'firebase-admin';
import { Firestore } from "firebase-admin/firestore";
import { VideoModule } from "../domain/models/module.model";

@Injectable()
export class VideoFirestoreRepository implements VideoRepository {
    private readonly db: Firestore;
    constructor(){
        this.db = admin.firestore();
    }

    async getVideoByLevel(level: string): Promise<VideoModule[]> {
        const videosQuerySnapshot = await this.db.collection('videos').where('level', '==', level).get();
        if(!videosQuerySnapshot){
            return [];
        }
        const videoModules: VideoModule[] = videosQuerySnapshot.docs.map((doc) => {
            const data = doc.data();
            return new VideoModule(
                data.index,
                data.topic
            )
        })
        return videoModules;
    }

}