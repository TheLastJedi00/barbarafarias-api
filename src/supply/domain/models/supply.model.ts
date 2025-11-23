import { Level } from "../types/student.level";
import { Module } from "../types/student.supply";

export class Supply {
    private studentId: string;
    private level: Level;
    private modules: Module[];

    constructor(studentId: string, level: Level, modules: Module[]) {
        this.studentId = studentId;
        this.level =  level;
        this.modules = [];
    }

    toPlainObject(){
        return{
            studentId: this.studentId,
            level: this.level,
            modules: this.modules,
        }
    }

    getDocumentId(): string {
        return `${this.studentId}_${this.level}`;
    }
}