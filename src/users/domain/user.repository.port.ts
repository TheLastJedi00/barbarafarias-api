import { User } from "./user.model";

export interface UserRepository{
    findByEmail(email: string): Promise<User | null>;
    save(user: User, uid: string): Promise<string>;
    findAll(): Promise<User[]>;
    findById(id: string): Promise<User | null>;
    update(user: User): Promise<void>;
    delete(id: string): Promise<void>;
}