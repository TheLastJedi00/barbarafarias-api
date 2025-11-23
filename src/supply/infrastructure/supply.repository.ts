import { Firestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { Supply } from "../domain/models/supply.model";
import { Level } from "../domain/types/student.level";
import { Injectable } from "@nestjs/common";
import { SupplyRepository } from "../domain/supply.repository.port";

@Injectable()
export class SupplyFirestoreRepository implements SupplyRepository {
    private readonly db: Firestore;
    private readonly collectionName = 'student_supplies';

    constructor() {
        this.db = admin.firestore();
    }

    async save(supply: Supply): Promise<string> {
        const docId = supply.getDocumentId();
        const data = supply.toPlainObject();
        await this.db.collection(this.collectionName).doc(docId).set(data, { merge: true });
        return docId;
    }

    async findByStudentId(studentId: string): Promise<Supply[]> {
        const snapshot = await this.db.collection(this.collectionName)
            .where('studentId', '==', studentId)
            .get();
        if (snapshot.empty) {
            return [];
        }
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return new Supply(
                data.studentId,
                data.level,
                data.modules
            );
        });
    }


    async findByStudentAndLevel(studentId: string, level: Level): Promise<Supply | null> {
        const docId = `${studentId}_${level}`;
        const doc = await this.db.collection(this.collectionName).doc(docId).get();

        if (!doc.exists) {
            return null;
        }

        const data = doc.data();
        return new Supply(
            data!.studentId,
            data!.level,
            data!.modules
        );
    }

    async update(supply: Supply): Promise<string> {
        return this.save(supply);
    }

    async delete(studentId: string, level: Level): Promise<void> {
        const docId = `${studentId}_${level}`;
        await this.db.collection(this.collectionName).doc(docId).delete();
    }
}