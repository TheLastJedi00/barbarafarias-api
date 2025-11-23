import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";
import { UserFirestoreRepository } from "../infrastructure/user.repository";
import { UserService } from "./user.service";
import { IsEmailUnique } from "../infrastructure/validators/IsEmailUnique.constraint";

@Module({
  imports: [ UserModule ],
  controllers: [UserController],
  providers: [
    UserService, {
    provide: 'UserRepository', 
    useClass: UserFirestoreRepository},
    IsEmailUnique
  ],
  exports: [ 'UserRepository' ]
})
export class UserModule {}