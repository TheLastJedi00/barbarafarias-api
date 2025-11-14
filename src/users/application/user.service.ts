import { Inject, Injectable } from "@nestjs/common";
import { User } from "../domain/user.model";
import { CreateUserDto } from "../application/dto/CreateUser.dto";
import type { UserRepository } from "../domain/user.repository.port";

@Injectable()
export class UserService{
    constructor(@Inject('UserRepository') private userRepository: UserRepository){}

    createUser(dto: CreateUserDto): User {
        const user = new User(
            dto.fullName, 
            dto.phone, 
            dto.email, 
            dto.objectives, 
            dto.prognosys);
        this.userRepository.save(user);
        return user;
    }
}