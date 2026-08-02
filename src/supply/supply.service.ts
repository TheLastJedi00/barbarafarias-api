import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { SupplyInfoDto } from './dtos/SupplyInfo.dto';
import { TopicRequestDto } from './dtos/TopicRequest.dto';
import { ConsolidateDto } from './dtos/Consolidate.dto';
import { ConsolidateModuleDto } from './dtos/ConsolidateModule.dto';
import { FinishConsolidationDto } from './dtos/FinishConsolidation.dto';
import { StudentInfo } from '../types/student.info';
import { Level } from '../types/student.level';
import { UserService } from '../users/user.service';
import { SupplyHeader, SupplyRepository } from './supply.repository';
import { PromptService } from '../prompts/prompt.service';
import { GeminiProvider } from './gemini/gemini.service';
import { Supply } from './supply.model';
import {
  ModuleSchema,
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
   * Etapa 3 — Consolidação atômica: valida o material inteiro (Zod, fonte de
   * verdade) e persiste de uma vez. Continua servindo materiais pequenos e
   * clientes anteriores ao caminho granular; materiais grandes devem usar
   * `consolidateModule` + `finishConsolidation`, que não trafegam tudo junto.
   */
  async consolidate(dto: ConsolidateDto): Promise<Supply> {
    const modules = this.parseOrThrow(() =>
      SupplyModulesSchema.parse(dto.modules),
    );
    const supply = new Supply(dto.studentId, dto.level, modules);
    await this.supplyRepository.saveAll(supply);
    return supply;
  }

  /**
   * Consolidação granular — um módulo por requisição (spec 011/B1.8).
   * Idempotente: o docId deriva de (aluno, nível, índice), então reenviar o
   * mesmo módulo sobrescreve em vez de duplicar. O material só volta a ser
   * legível pelo aluno depois do `finishConsolidation`.
   */
  async consolidateModule(dto: ConsolidateModuleDto): Promise<SupplyHeader> {
    if (dto.index >= dto.moduleCount) {
      throw new BadRequestException(
        `Índice ${dto.index} fora do material anunciado (${dto.moduleCount} módulos).`,
      );
    }
    const module = this.parseOrThrow(() => ModuleSchema.parse(dto.module));

    await this.supplyRepository.saveModule(
      dto.studentId,
      dto.level,
      dto.index,
      dto.moduleCount,
      module,
    );
    return {
      studentId: dto.studentId,
      level: dto.level,
      moduleCount: dto.moduleCount,
      status: 'draft',
    };
  }

  /**
   * Fecha a consolidação granular. Confere se todos os módulos anunciados
   * chegaram; faltando algum, devolve 409 com os índices em falta para o
   * cliente reenviar só o que falhou, em vez de refazer o material inteiro.
   */
  async finishConsolidation(dto: FinishConsolidationDto): Promise<Supply> {
    const header = await this.supplyRepository.findHeader(
      dto.studentId,
      dto.level,
    );
    if (!header) {
      throw new NotFoundException('Nenhuma consolidação em andamento.');
    }

    const present = new Set(
      await this.supplyRepository.findModuleIndices(dto.studentId, dto.level),
    );
    const missing = Array.from(
      { length: header.moduleCount },
      (_, index) => index,
    ).filter((index) => !present.has(index));

    if (missing.length > 0) {
      throw new ConflictException({
        message: 'Material incompleto: faltam módulos.',
        missing,
      });
    }

    await this.supplyRepository.markComplete(
      dto.studentId,
      dto.level,
      header.moduleCount,
    );

    const supply = await this.supplyRepository.findByStudentAndLevel(
      dto.studentId,
      dto.level,
    );
    if (!supply) {
      throw new InternalServerErrorException(
        'Material consolidado não pôde ser lido de volta.',
      );
    }
    return supply;
  }

  /**
   * Roda uma validação Zod distinguindo os dois tipos de falha que o `catch`
   * único anterior misturava: material malformado (culpa do cliente, 400, com
   * os caminhos exatos que falharam) e erro de gravação (culpa do servidor,
   * 500 com stack). Antes, uma recusa do Firestore era reportada como
   * "material inválido" — diagnóstico errado no lugar errado.
   */
  private parseOrThrow<T>(parse: () => T): T {
    try {
      return parse();
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'Material inválido ou incompleto para consolidação.',
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      throw error;
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

  /**
   * Níveis com material pronto. Devolve só os cabeçalhos: as telas que
   * consomem isto usam apenas o nível, e hidratar os módulos significaria
   * baixar o material inteiro dos quatro níveis para desenhar quatro rótulos.
   */
  async findSuppliesByStudentId(studentId: string): Promise<SupplyHeader[]> {
    return this.supplyRepository.findHeadersByStudentId(studentId);
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
