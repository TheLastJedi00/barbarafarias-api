export class ResponseUserDto {
    id: string;
    fullName: string;
    createdAt: Date;
    updatedAt: Date;

    constructor(id: string, fullName: string, createdAt: Date, updatedAt: Date){
        this.id = id;
        this.fullName = fullName;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}