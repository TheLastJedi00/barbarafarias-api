import { User } from "./user.model";

export interface UserRepository{
    save(user: User): Promise<string | void>;
    findAll(): Promise<User[]>;
    findById(id: string): Promise<User | null>;
    update(user: User): Promise<void>;
    delete(id: string): Promise<void>;
}