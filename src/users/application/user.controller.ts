import { Body, Controller, Post } from "@nestjs/common";
import { UserService } from "./user.service";
import { CreateUserDto } from "./dto/CreateUser.dto";

@Controller('/users')
export class UserController {

    constructor(private service: UserService){}

    @Post()
    createUser(@Body() user:CreateUserDto){
        return this.service.createUser(user);;
    }
}