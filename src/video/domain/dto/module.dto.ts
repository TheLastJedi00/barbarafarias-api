import { Type } from "class-transformer";
import { IsArray, IsNotEmpty, IsNotEmptyObject, IsOptional, ValidateNested } from "class-validator";

export class VideoModuleDto {
    @IsNotEmpty({message: "Index is required"})
    index: number;
    @IsNotEmpty({message: "Level is required"})
    level: string;
    @ValidateNested({each: true})
    @IsArray()
    @Type(() => VideoTopicDto)
    topic: VideoTopicDto[]
}

export class VideoTopicDto {
    @IsNotEmpty({message: "Title is required"})
    title: string;
    @IsNotEmpty({message: "Description is required"})
    description: string;
    @ValidateNested({each: true})
    @IsArray()
    @Type(() => VideoDto)
    @IsOptional()
    videos?: VideoDto[] = [];
}

export class VideoDto {
    @IsNotEmpty({message: "YoutubeId is required"})
    youtubeId: string
    @IsNotEmpty({message: "Title is required"})
    title: string
    @IsNotEmpty({message: "InternalHash is required"})
    internalHash: string
    @IsNotEmpty({message: "Order is required"})
    order: number
}

