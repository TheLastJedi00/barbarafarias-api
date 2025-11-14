import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";
import { UserFirestoreRepository } from "../infrastructure/user.repository";
import { UserService } from "./user.service";

@Module({
  imports: [],
  controllers: [UserController],
  providers: [UserService, {
    provide: 'UserRepository', 
    useClass: UserFirestoreRepository}],
})
export class UserModule {}