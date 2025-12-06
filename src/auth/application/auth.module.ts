import { Module } from "@nestjs/common";
import { FirebaseAuthGuard } from "../infrastructure/firebase.guard";
import { RolesGuard } from "../infrastructure/roles.guard";
import { UserService } from "src/users/application/user.service";
import { TeacherService } from "src/teacher/application/teacher.service";

@Module({
    providers: [ FirebaseAuthGuard, RolesGuard, UserService, TeacherService ],
    exports: [ FirebaseAuthGuard, RolesGuard ],
    controllers: [],
    imports: [],
})
export class AuthModule {}