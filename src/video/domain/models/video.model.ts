export class Video {
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