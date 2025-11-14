import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";
import { UserRepository } from "./user.repository";

@Module({
  imports: [],
  controllers: [UserController],
  providers: [UserRepository, UserRepository],
})
export class UserModule {}