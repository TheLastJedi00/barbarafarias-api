import { Module } from "@nestjs/common";
import { TeacherModule } from "src/teacher/application/teacher.module";
import { UserModule } from "src/users/application/user.module";
import { FirebaseAuthGuard } from "../infrastructure/firebase.guard";

@Module({
    providers: [ FirebaseAuthGuard ],
    exports: [],
    controllers: [],
    imports: [],
})
export class AuthModule {}