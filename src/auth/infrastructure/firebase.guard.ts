import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import * as admin from 'firebase-admin';
import { Firestore } from "firebase-admin/firestore";

@Injectable()
export class FirebaseAuthGuard  {

}