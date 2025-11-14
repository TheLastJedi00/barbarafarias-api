import { User } from "./user.model";

export interface UserRepository{
    save(user: User): Promise<void>;
}