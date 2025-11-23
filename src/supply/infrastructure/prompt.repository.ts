import { Prompt } from "../domain/models/prompt.model";
import { Level } from "../domain/types/student.level";

export interface PromptRepository {
    getPromptByLevel(level: Level): Promise<Prompt | null>;
}