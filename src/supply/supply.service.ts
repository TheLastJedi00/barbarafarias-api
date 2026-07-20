import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupplyInfoDto } from './dtos/SupplyInfo.dto';
import { TopicRequestDto } from './dtos/TopicRequest.dto';
import { ConsolidateDto } from './dtos/Consolidate.dto';
import { StudentInfo } from '../types/student.info';
import { Level } from '../types/student.level';
import { UserService } from '../users/user.service';
import { SupplyRepository } from './supply.repository';
import { PromptService } from '../prompts/prompt.service';
import { GeminiProvider } from './gemini/gemini.service';
import { Supply } from './supply.model';
import {
  SkeletonModuleWithId,
  SkeletonSchema,
  SupplyModulesSchema,
  TopicSchema,
  type Topic,
} from '../types/student.supply';
import { buildSkeletonPrompt, buildTopicPrompt } from './prompts';

@Injectable()
export class SupplyService {
  private readonly logger = new Logger(SupplyService.name);
  constructor(
    private readonly supplyRepository: SupplyRepository,
    private readonly userService: UserService,
    private readonly promptService: PromptService,
    private readonly genAi: GeminiProvider,
  ) {}

  /**
   * Reidrata o par (aluno + prompt-base do nível) usado por skeleton e topic.
   * 404 se o aluno não existe; 500 se não há prompt para o nível.
   */
  private async loadContext(
    studentId: string,
    level: Level,
  ): Promise<{ studentInfo: StudentInfo; basePrompt: string }> {
    const student = await this.userService.findById(studentId);
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    const prompt = await this.promptService.getPromptByLevel(level);
    if (!prompt) {
      throw new InternalServerErrorException('Prompt not found');
    }
    const studentInfo: StudentInfo = {
      firstName: student.fullName.split(' ')[0],
      objectives: student.objective,
      prognosis: student.prognosis,
    };
    return { studentInfo, basePrompt: prompt.prompt };
  }

  /**
   * Etapa 1 — Esqueleto: a IA devolve só a estrutura (módulos + títulos de
   * tópicos). O backend atribui um `id` estável a cada tópico (`m{i}_t{j}`)
   * para o cliente chavear a UI e o retry granular.
   */
  async generateSkeleton(
    dto: SupplyInfoDto,
  ): Promise<{ modules: SkeletonModuleWithId[] }> {
    try {
      const { studentInfo, basePrompt } = await this.loadContext(
        dto.studentId,
        dto.level,
      );
      const prompt = buildSkeletonPrompt(basePrompt, studentInfo);
      const skeleton = await this.genAi.generateJson(prompt, SkeletonSchema);

      const modules: SkeletonModuleWithId[] = skeleton.map((mod, mi) => ({
        title: mod.title,
        text: mod.text,
        topics: mod.topics.map((t, ti) => ({
          id: `m${mi}_t${ti}`,
          topic: t.topic,
        })),
      }));
      return { modules };
    } catch (error) {
      throw this.rethrow('gerar esqueleto', error);
    }
  }

  /**
   * Etapa 2 — Conteúdo completo de UM tópico. Stateless: apenas gera e
   * devolve; a montagem do material fica no cliente. Idempotente (retry
   * simplesmente refaz a chamada).
   */
  async generateTopic(dto: TopicRequestDto): Promise<Topic> {
    try {
      const { studentInfo, basePrompt } = await this.loadContext(
        dto.studentId,
        dto.level,
      );
      const prompt = buildTopicPrompt(
        basePrompt,
        studentInfo,
        dto.moduleTitle,
        dto.topicTitle,
      );
      return await this.genAi.generateJson(prompt, TopicSchema);
    } catch (error) {
      throw this.rethrow('gerar tópico', error);
    }
  }

  /**
   * Etapa 3 — Consolidação: valida o material inteiro (Zod, fonte de verdade)
   * e persiste uma única vez. Rejeita material incompleto/malformado.
   */
  async consolidate(dto: ConsolidateDto): Promise<Supply> {
    try {
      const modules = SupplyModulesSchema.parse(dto.modules);
      const supply = new Supply(dto.studentId, dto.level, modules);
      await this.supplyRepository.save(supply);
      return supply;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Material inválido na consolidação', error?.stack);
      throw new InternalServerErrorException(
        'Material inválido ou incompleto para consolidação.',
      );
    }
  }

  private rethrow(action: string, error: unknown): HttpException {
    if (error instanceof HttpException) {
      return error;
    }
    this.logger.error(
      `Erro ao ${action}`,
      error instanceof Error ? error.stack : String(error),
    );
    return new InternalServerErrorException(`Failed to ${action}: ${error}`);
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
