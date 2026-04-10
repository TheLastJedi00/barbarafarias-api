import { Prompt } from './models/prompt.model';
import { Level } from './types/student.level';

export interface PromptRepository {
  getPromptByLevel(level: Level): Promise<Prompt | null>;
}
