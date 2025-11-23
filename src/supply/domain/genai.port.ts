import { StudentInfo } from "./types/student.info";
import { Module } from "./types/student.supply";

export interface GenerativeAIService {
    generateContent(prompt: string, studentInfo: StudentInfo): Promise<Module[]>;
}