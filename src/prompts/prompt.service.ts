import { Injectable, NotFoundException } from '@nestjs/common';
import { PromptRepository } from './prompt.repository';
import { Level } from '../types/student.level';
import { Prompt } from './prompt.model';

@Injectable()
export class PromptService {
  constructor(private readonly promptRepository: PromptRepository) {}
  async getPromptByLevel(level: Level): Promise<Prompt> {
    const prompt = await this.promptRepository.getPromptByLevel(level);
    if (!prompt) {
      throw new NotFoundException(`Prompt with level ${level} not found`);
    }
    return prompt;
  }
}
