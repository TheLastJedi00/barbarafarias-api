import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
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
import { Blueprint, CurriculumService } from '../curriculum/curriculum.service';
import { GeminiProvider } from './gemini/gemini.service';
import { Supply } from './supply.model';
import {
  ModuleIntrosSchema,
  ModuleSchema,
  SkeletonModuleWithId,
  SupplyModulesSchema,
  TopicSchema,
  type Topic,
} from '../types/student.supply';
import { buildModuleIntrosPrompt, buildTopicPrompt } from './prompts';

@Injectable()
export class SupplyService {
  private readonly logger = new Logger(SupplyService.name);
  constructor(
    private readonly supplyRepository: SupplyRepository,
    private readonly userService: UserService,
    private readonly curriculumService: CurriculumService,
    private readonly genAi: GeminiProvider,
  ) {}

  /**
   * Reidrata o trio (aluno + prompt-base do nível + currículo) usado por
   * skeleton e topic.
   *
   * O prompt-base é a concatenação do Prompt Principal (persona, formato e
   * diretrizes universais) com o prompt do nível, ambos escritos pela Teacher
   * no painel `/prompt-manager`. Até a spec 020 isto vinha da coleção `prompts`,
   * que nenhum endpoint alimentava: a Teacher editava o painel e a geração lia
   * outro lugar, o que produzia "Prompt not found" em produção.
   *
   * 404 se o aluno não existe; 422 se o nível ainda não foi configurado.
   */
  private async loadContext(
    studentId: string,
    level: Level,
  ): Promise<{
    studentInfo: StudentInfo;
    basePrompt: string;
    blueprint: Blueprint;
  }> {
    const student = await this.userService.findById(studentId);
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const [principal, curriculum] = await Promise.all([
      this.curriculumService.getPrincipal(),
      this.curriculumService.getLevel(level),
    ]);

    if (!curriculum.prompt.trim() && curriculum.modules.length === 0) {
      throw new UnprocessableEntityException(
        `O nível ${level} ainda não tem currículo configurado. ` +
          'Preencha o prompt do nível e os módulos em Prompts e Estrutura Curricular antes de gerar o material.',
      );
    }

    const basePrompt = [principal.prompt, curriculum.prompt]
      .map((part) => part.trim())
      .filter(Boolean)
      .join('\n\n');

    const studentInfo: StudentInfo = {
      firstName: student.fullName.split(' ')[0],
      objectives: student.objective,
      prognosis: student.prognosis,
    };
    return {
      studentInfo,
      basePrompt,
      blueprint: this.curriculumService.toBlueprint(curriculum),
    };
  }

  /**
   * Etapa 1 — Esqueleto: a estrutura vem do currículo que a Teacher cadastrou
   * no painel (módulos, títulos de tópicos e ids), não mais da IA. Quantos
   * módulos existem, com que nomes e em que ordem passa a ser decisão dela.
   *
   * A IA continua na etapa, mas com um único trabalho: escrever a intro de cada
   * módulo, personalizada para o aluno. Os ids dos tópicos são os do currículo
   * (uuid estável) em vez dos `m{i}_t{j}` posicionais, então o retry granular do
   * cliente continua funcionando sem mudança de contrato.
   */
  async generateSkeleton(
    dto: SupplyInfoDto,
  ): Promise<{ modules: SkeletonModuleWithId[] }> {
    try {
      const { studentInfo, basePrompt, blueprint } = await this.loadContext(
        dto.studentId,
        dto.level,
      );

      if (blueprint.modules.length === 0) {
        throw new UnprocessableEntityException(
          `O nível ${dto.level} não tem nenhum módulo cadastrado. ` +
            'Monte a estrutura em Prompts e Estrutura Curricular antes de gerar o material.',
        );
      }

      const prompt = buildModuleIntrosPrompt(basePrompt, studentInfo, blueprint);
      const intros = await this.genAi.generateJson(prompt, ModuleIntrosSchema);

      const modules: SkeletonModuleWithId[] = blueprint.modules.map(
        (mod, mi) => ({
          title: mod.title,
          text: intros[mi] ?? '',
          topics: mod.topics.map((t) => ({ id: t.id, topic: t.title })),
        }),
      );
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
      const { studentInfo, basePrompt, blueprint } = await this.loadContext(
        dto.studentId,
        dto.level,
      );
      // O título do módulo é o que a Teacher cadastrou e o cliente devolve
      // verbatim do esqueleto, então casar por ele dispensa um id no payload.
      // Sem correspondência (currículo editado no meio da geração), gera-se o
      // tópico sem a diretriz em vez de falhar.
      const module = blueprint.modules.find((m) => m.title === dto.moduleTitle);
      const prompt = buildTopicPrompt(
        basePrompt,
        studentInfo,
        dto.moduleTitle,
        dto.topicTitle,
        module?.context ?? '',
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
