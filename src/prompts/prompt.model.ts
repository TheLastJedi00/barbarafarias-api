import { Level } from '../types/student.level';

export class Prompt {
  public readonly level: Level;
  public readonly prompt: string;

  constructor(level: Level, prompt: string) {
    this.level = level;
    this.prompt = prompt;
  }
}
