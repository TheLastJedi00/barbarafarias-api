import { Module } from "@nestjs/common";
import { FirebaseAuthGuard } from "../infrastructure/firebase.guard";
import { RolesGuard } from "../infrastructure/roles.guard";

@Module({
    providers: [ FirebaseAuthGuard, RolesGuard ],
    exports: [ FirebaseAuthGuard, RolesGuard ],
    controllers: [],
    imports: [],
})
export class AuthModule {}