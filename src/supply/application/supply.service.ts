import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupplyRepository } from '../domain/supply.repository.port';
import { Supply } from '../domain/models/supply.model';
import { SupplyInfoDto } from './dtos/SupplyInfo.dto';
import type { UserRepository } from 'src/users/domain/user.repository.port';
import type { GenerativeAIService } from '../domain/genai.port';
import type { PromptRepository } from '../domain/prompt.repository.port';
import { StudentInfo } from '../domain/types/student.info';
import { Level } from '../domain/types/student.level';

@Injectable()
export class SupplyService {
  constructor(
    @Inject('SupplyRepository')
    private readonly supplyRepository: SupplyRepository,
    @Inject('UserRepository') private readonly userRepository: UserRepository,
    @Inject('PromptRepository')
    private readonly promptRepository: PromptRepository,
    @Inject('GenerativeAIService') private readonly genAi: GenerativeAIService,
  ) {}

  async createSupply(dto: SupplyInfoDto): Promise<SupplyInfoDto> {
    try {
      //get student data and prompt by level
      const student = await this.userRepository.findById(dto.studentId);
      const prompt = await this.promptRepository.getPromptByLevel(dto.level);
      //error 404 if student not found
      if (!student) {
        throw new NotFoundException('Student not found');
      }
      //error 500 if prompt not found
      if (!prompt) {
        throw new InternalServerErrorException('Prompt not found');
      }
      //filter student info
      const studentInfo: StudentInfo = {
        firstName: student.getFullName().split(' ')[0],
        objectives: student.getObjectives(),
        prognosis: student.getPrognosis(),
      };
      //receive modules from genAI service
      const modules = await this.genAi.generateContent(
        prompt.prompt,
        studentInfo,
      );
      //create supply entity and save it
      const supply = new Supply(dto.studentId, dto.level, modules);
      this.supplyRepository.save(supply);
      return dto;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Error creating supply:', error);
      throw new InternalServerErrorException(
        `Failed to create supply: ${error.message}`,
      );
    }
  }

  async findSuppliesByStudentId(studentId: string): Promise<Supply[]> {
    return this.supplyRepository.findByStudentId(studentId);
  }

  async findSupplyByStudentAndLevel(
    studentId: string,
    level: Level,
  ): Promise<Supply | null> {
    return this.supplyRepository.findByStudentAndLevel(studentId, level);
  }
  async deleteSupply(studentId: string, level: Level): Promise<void> {
    return this.supplyRepository.delete(studentId, level);
  }
}
