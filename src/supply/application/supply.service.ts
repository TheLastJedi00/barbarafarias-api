import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupplyRepository } from '../domain/supply.repository.port';
import { StudentSupplyDto } from './dtos/CreateSupply.dto';
import { Supply } from '../domain/models/supply.model';
import { SupplyInfoDto } from './dtos/SupplyInfo.dto';
import type { UserRepository } from 'src/users/domain/user.repository.port';
import type { GenerativeAIService } from '../domain/genai.port';
import type { PromptRepository } from '../infrastructure/prompt.repository';
import { StudentInfo } from '../domain/types/student.info';

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

  async createSupply(dto: SupplyInfoDto): Promise<void> {
    try {
      //check if supply already exists
      const existingSupply = await this.supplyRepository.findByStudentAndLevel(
        dto.studentId,
        dto.level,
      );
      //error 409 if supply already exists
      if (existingSupply) {
        throw new ConflictException(
          'Supply for this student and level already exists',
        );
      }
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
      return this.supplyRepository.save(supply);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Error creating supply:', error);
      throw new InternalServerErrorException(`Failed to create supply: ${error.message}`);
    }
  }

  async findSuppliesByStudentId(studentId: string): Promise<Supply[]> {
    return this.supplyRepository.findByStudentId(studentId);
  }

  async findSupplyByStudentAndLevel(
    studentId: string,
    level: string,
  ): Promise<Supply | null> {
    return this.supplyRepository.findByStudentAndLevel(studentId, level as any);
  }

  async updateSupply(dto: StudentSupplyDto): Promise<void> {
    const supply = new Supply(dto.studentId, dto.level, dto.content);
    return this.supplyRepository.update(supply);
  }
  async deleteSupply(studentId: string, level: string): Promise<void> {
    return this.supplyRepository.delete(studentId, level as any);
  }
}
