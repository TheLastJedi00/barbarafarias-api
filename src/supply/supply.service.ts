import {
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupplyInfoDto } from './dtos/SupplyInfo.dto';
import { StudentInfo } from '../types/student.info';
import { Level } from '../types/student.level';
import { UserService } from '../users/user.service';
import { SupplyRepository } from './supply.repository';
import { PromptService } from '../prompts/prompt.service';
import { GeminiProvider } from './gemini/gemini.service';
import { Supply } from './supply.model';
import { SupplyModulesSchema } from '../types/student.supply';

@Injectable()
export class SupplyService {
  constructor(
    private readonly supplyRepository: SupplyRepository,
    private readonly userService: UserService,
    private readonly promptService: PromptService,
    private readonly genAi: GeminiProvider,
  ) {}
  async createSupply(dto: SupplyInfoDto): Promise<SupplyInfoDto> {
    try {
      //get student data and prompt by level
      const student = await this.userService.findById(dto.studentId);
      const prompt = await this.promptService.getPromptByLevel(dto.level);
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
        firstName: student.fullName.split(' ')[0],
        objectives: student.objective,
        prognosis: student.prognosis,
      };

      const fullPrompt = `${prompt.prompt}\n
        Dados do aluno:\n
        Nome: ${studentInfo.firstName}\n
        Objetivos pessoais do aluno: ${studentInfo.objectives}\n
        Prognóstico da Teacher: ${studentInfo.prognosis}`;

      //receive modules from genAI service
      const aiResponse = await this.genAi.generateContent(fullPrompt);

      let modules;
      try {
        const jsonContent = JSON.parse(aiResponse);
        modules = SupplyModulesSchema.parse(jsonContent);
      } catch (e) {
        console.error(
          'Falha ao validar o JSON retornado pela IA com o Zod:',
          e,
        );
        throw new InternalServerErrorException(
          'A IA retornou um formato inválido.',
        );
      }

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
        `Failed to create supply: ${error}`,
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
