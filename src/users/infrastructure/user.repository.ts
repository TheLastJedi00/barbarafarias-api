import { Injectable } from "@nestjs/common";
import { User } from "../domain/user.model";
import { UserRepository } from "../domain/user.repository.port";
import { Firestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";

@Injectable()
export class UserFirestoreRepository implements UserRepository {

    private readonly db: Firestore;
    constructor(){
        this.db = admin.firestore();
    }

    async save(user: User): Promise<void> {
        const userObject = { ...user }
        await this.db.collection('users').doc().set(userObject);
    }

    async findAll(): Promise<User[]> {
        const querySnapshot = await this.db.collection('users').get();
        const users = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return new User (
                data.fullName,
                data.phone,
                data.email,
                data.objectives,
                data.prognosis,
                doc.id
             );
        });
        return users;
    }
}