import { Supply } from "./models/supply.model";
import { Level } from "./types/student.level";

export interface SupplyRepository {
    save(supply: Supply): Promise<string>;
    findByStudentId(studentId: string): Promise<Supply[]>;
    findByStudentAndLevel(studentId: string, level: Level): Promise<Supply | null>;
    update(supply: Supply): Promise<string>;
    delete(studentId: string, level: Level): Promise<void>;
}