import { Body, Controller } from "@nestjs/common";
import { User } from "./user.model";

@Controller('/users')
export class UserController {
    createUser(@Body() user:User){
        return user;
    }
}