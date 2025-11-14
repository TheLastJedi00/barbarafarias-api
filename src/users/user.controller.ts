import { Body, Controller, Post } from "@nestjs/common";
import { User } from "./user.model";
import { UserService } from "./user.service";

@Controller('/users')
export class UserController {

    constructor(private service: UserService){}

    @Post()
    createUser(@Body() user:User){
        return this.service.createUser(user);;
    }
}