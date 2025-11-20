import { Supply } from "./supply.model";
import { Level } from "./types/student.level";

export interface SupplyRepository {
    save(supply: Supply): Promise<void>;
    findByStudentId(studentId: string): Promise<Supply[]>;
    findByStudentAndLevel(studentId: string, level: Level): Promise<Supply | null>;
    update(supply: Supply): Promise<void>;
    delete(studentId: string, level: Level): Promise<void>;
}