import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CurriculumService,
  type Blueprint,
} from '../curriculum/curriculum.service';
import { GeminiProvider } from '../supply/gemini/gemini.service';
import {
  buildModuleIntrosPrompt,
  buildTopicPrompt,
  composeBasePrompt,
  storeStudentInfo,
} from '../supply/prompts';
import {
  ModuleIntrosSchema,
  ModuleSchema,
  TopicSchema,
  type Module,
  type Topic,
} from '../types/student.supply';
import { UserRepository } from '../users/user.repository';
import type { User } from '../users/user.entity';
import { STORE_PRODUCT_KIND } from './store-product.model';
import { StorePurchase, isPurchaseActive } from './store-purchase.model';
import { StorePurchaseRepository } from './store-purchase.repository';
import {
  INTRO_STEP,
  STORE_MAX_STEP_ATTEMPTS,
  StoreSupply,
  StoreSupplyPending,
  StoreSupplyStep,
  StoreSupplyStepStatus,
  storeSupplyId,
} from './store-supply.model';
import { StoreSupplyRepository } from './store-supply.repository';
import { StoreChances, chancesFor, isPendingStuck } from './store-supply.rules';

export const STEP_SUPPORT_MESSAGE =
  'Não conseguimos gerar esta parte do material. Fale com o suporte pelo WhatsApp.';

export const EXPIRED_MATERIAL_MESSAGE =
  'Este acesso venceu. Renove o módulo para voltar ao material.';

/** O que a tela "Meus módulos" lê do material de uma compra. */
export interface StoreMaterialView {
  purchaseId: string;
  careerProfileAnswered: boolean;
  /** Material vigente, montado. `null` até a primeira geração terminar. */
  material: Module | null;
  generatedAt?: string;
  chances: StoreChances;
  pending: {
    number: number;
    /** Uma etapa gastou as tentativas: só uma geração nova sai daqui. */
    stuck: boolean;
    steps: {
      id: string;
      title: string;
      status: StoreSupplyStepStatus;
      attempts: number;
    }[];
  } | null;
}

export interface StoreStepResult {
  stepId: string;
  status: 'done';
  /** Intro: texto. Tópico: o tópico inteiro. */
  content: string | Topic;
}

/** Relógio injetável: a regra das 6 h só se testa com o tempo na mão. */
export type Clock = () => Date;
export const STORE_CLOCK = 'STORE_CLOCK';

/**
 * Material personalizado da loja (spec 033): geração orquestrada pelo
 * navegador do comprador, etapa por etapa, com o estado guardado aqui.
 *
 * Diferente da geração do plano (spec 020), **o servidor guarda cada etapa** e
 * monta o módulo no fim. O cliente da professora é confiável e monta o
 * material; o do comprador não, e o que vai para a tela dele tem de ter saído
 * do Gemini, não do corpo de uma requisição.
 */
@Injectable()
export class StoreSupplyService {
  private readonly logger = new Logger(StoreSupplyService.name);

  constructor(
    private readonly supplies: StoreSupplyRepository,
    private readonly purchases: StorePurchaseRepository,
    private readonly users: UserRepository,
    private readonly curriculum: CurriculumService,
    private readonly genAi: GeminiProvider,
    @Optional()
    @Inject(STORE_CLOCK)
    private readonly clock: Clock = () => new Date(),
  ) {}

  /**
   * Abre uma geração, gastando uma chance. Se já há uma em andamento desta
   * compra, devolve ela (a aba fechou e voltou); só a travada — etapa sem
   * tentativa — é trocada por uma nova.
   */
  async start(userId: string, purchaseId: string): Promise<StoreMaterialView> {
    const purchase = await this.requireActive(userId, purchaseId);
    const user = await this.requireUser(userId);
    if (!user.careerProfile) {
      throw new ConflictException(
        'Responda o questionário antes de gerar o material.',
      );
    }
    const { module } = await this.loadModule(purchase);
    const at = this.clock();
    const id = storeSupplyId(userId, purchase.productId);

    const { supply, abandoned } = await this.supplies.transact(
      id,
      (current) => {
        const pending = current?.pending;
        if (
          pending &&
          pending.purchaseId === purchase.id &&
          !isPendingStuck(pending)
        ) {
          return { result: { supply: current, abandoned: undefined } };
        }

        const chances = chancesFor(current, purchase.id, at);
        if (!chances.canGenerate) {
          throw new ConflictException({
            message: chances.nextAvailableAt
              ? 'A próxima geração ainda não foi liberada.'
              : 'As gerações desta compra acabaram.',
            nextAvailableAt: chances.nextAvailableAt,
          });
        }

        const number = (current?.lastGeneration ?? 0) + 1;
        const iso = at.toISOString();
        const next: StoreSupply = {
          id,
          userId,
          productId: purchase.productId,
          level: purchase.level!,
          moduleId: purchase.moduleId!,
          ...(current?.current ? { current: current.current } : {}),
          chances: {
            purchaseId: purchase.id,
            used: chances.used + 1,
            lastStartedAt: iso,
          },
          lastGeneration: number,
          pending: {
            number,
            purchaseId: purchase.id,
            startedAt: iso,
            moduleTitle: module.title,
            careerProfile: user.careerProfile!,
            order: [INTRO_STEP, ...module.topics.map((t) => t.id)],
            steps: Object.fromEntries(
              [{ id: INTRO_STEP, title: 'Introdução' }, ...module.topics].map(
                (t): [string, StoreSupplyStep] => [
                  t.id,
                  { title: t.title, status: 'pending', attempts: 0 },
                ],
              ),
            ),
          },
          createdAt: current?.createdAt ?? iso,
          updatedAt: iso,
        };
        return {
          write: next,
          result: { supply: next, abandoned: pending?.number },
        };
      },
    );

    // A geração travada que ficou para trás não é material de ninguém.
    if (abandoned !== undefined) {
      await this.supplies.deleteContent(id, abandoned);
    }
    return this.view(purchase, user, supply);
  }

  /**
   * Gera uma etapa (`intro` ou o id de um tópico) da geração em andamento.
   *
   * Idempotente: etapa pronta devolve o que já foi gerado. A tentativa é
   * contada **antes** de chamar o Gemini, numa transação — duas abas não passam
   * juntas do teto. Falhar não gasta geração; passar de 3 tentativas manda ao
   * suporte.
   */
  async step(
    userId: string,
    purchaseId: string,
    stepId: string,
  ): Promise<StoreStepResult> {
    const purchase = await this.requireActive(userId, purchaseId);
    const id = storeSupplyId(userId, purchase.productId);
    const supply = await this.supplies.findById(id);
    const pending = this.requirePending(supply, purchase);
    const step = pending.steps[stepId];
    if (!step) throw new NotFoundException('Etapa não encontrada.');

    if (step.status === 'done') {
      const content = await this.supplies.findContent(id, pending.number);
      const saved = content?.steps[stepId];
      if (saved !== undefined)
        return { stepId, status: 'done', content: saved };
    }

    await this.updateStep(id, pending.number, stepId, (current) => {
      if (current.status === 'done') return current;
      if (current.attempts >= STORE_MAX_STEP_ATTEMPTS) {
        throw new HttpException(
          { message: STEP_SUPPORT_MESSAGE, support: true },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return { ...current, attempts: current.attempts + 1 };
    });

    let content: string | Topic;
    try {
      content = await this.generate(purchase, userId, pending, stepId);
    } catch (error) {
      this.logger.error(
        `Falha ao gerar a etapa ${stepId} de ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      const failed = await this.updateStep(
        id,
        pending.number,
        stepId,
        (current) =>
          current.status === 'done'
            ? current
            : { ...current, status: 'failed' },
      );
      const left = STORE_MAX_STEP_ATTEMPTS - (failed?.attempts ?? 0);
      throw new BadGatewayException({
        message:
          left > 0
            ? 'Não foi possível gerar esta parte agora. Tente de novo.'
            : STEP_SUPPORT_MESSAGE,
        attemptsLeft: Math.max(left, 0),
      });
    }

    await this.supplies.saveStepContent(id, pending.number, stepId, content);
    await this.updateStep(id, pending.number, stepId, (current) => ({
      ...current,
      status: 'done',
    }));
    return { stepId, status: 'done', content };
  }

  /**
   * Fecha a geração: confere as etapas, monta o módulo na ordem do currículo
   * e o torna o material vigente. Até aqui o anterior continuou visível; a
   * troca e a exclusão dele vão num lote só.
   */
  async finish(userId: string, purchaseId: string): Promise<StoreMaterialView> {
    const purchase = await this.requireActive(userId, purchaseId);
    const user = await this.requireUser(userId);
    const id = storeSupplyId(userId, purchase.productId);
    const supply = await this.supplies.findById(id);
    const pending = this.requirePending(supply, purchase);

    const content = await this.supplies.findContent(id, pending.number);
    const missing = pending.order.filter(
      (stepId) =>
        pending.steps[stepId]?.status !== 'done' ||
        content?.steps[stepId] === undefined,
    );
    if (missing.length > 0) {
      throw new ConflictException({
        message: 'Material incompleto: faltam etapas.',
        missing,
      });
    }

    const parsed = ModuleSchema.safeParse({
      title: pending.moduleTitle,
      text: content!.steps[INTRO_STEP],
      topics: pending.order
        .filter((stepId) => stepId !== INTRO_STEP)
        .map((stepId) => content!.steps[stepId]),
    });
    if (!parsed.success) {
      throw new UnprocessableEntityException(
        'O material gerado veio num formato inesperado. Fale com o suporte.',
      );
    }

    const at = this.clock().toISOString();
    const next: StoreSupply = {
      ...supply!,
      current: { generation: pending.number, finishedAt: at },
      updatedAt: at,
    };
    delete next.pending;
    await this.supplies.finish(
      next,
      pending.number,
      parsed.data,
      supply!.current?.generation,
    );
    return this.view(purchase, user, next);
  }

  // ------------------------------------------------------------- internos

  /** Chama o Gemini para uma etapa, com as respostas copiadas na abertura. */
  private async generate(
    purchase: StorePurchase,
    userId: string,
    pending: StoreSupplyPending,
    stepId: string,
  ): Promise<string | Topic> {
    const [user, loaded] = await Promise.all([
      this.requireUser(userId),
      this.loadModule(purchase).catch(() => null),
    ]);
    const student = storeStudentInfo(
      user.fullName ?? '',
      pending.careerProfile,
    );
    const basePrompt = loaded?.basePrompt ?? '';
    const context = loaded?.module.context ?? '';

    if (stepId === INTRO_STEP) {
      const module = loaded?.module ?? {
        id: purchase.moduleId!,
        title: pending.moduleTitle,
        context: '',
        topics: [],
      };
      const intros = await this.genAi.generateJson(
        buildModuleIntrosPrompt(basePrompt, student, {
          level: purchase.level!,
          modules: [module],
        }),
        ModuleIntrosSchema,
      );
      return intros[0] ?? '';
    }

    // O título é o da abertura: o currículo pode ter mudado no meio.
    return this.genAi.generateJson(
      buildTopicPrompt(
        basePrompt,
        student,
        pending.moduleTitle,
        pending.steps[stepId].title,
        context,
      ),
      TopicSchema,
    );
  }

  /** Atualiza uma etapa da geração `number`, se ela ainda for a aberta. */
  private updateStep(
    id: string,
    number: number,
    stepId: string,
    change: (step: StoreSupplyStep) => StoreSupplyStep,
  ): Promise<StoreSupplyStep | null> {
    return this.supplies.transact(id, (current) => {
      const step = current?.pending?.steps[stepId];
      if (!current?.pending || current.pending.number !== number || !step) {
        return { result: null };
      }
      const next = change(step);
      if (next === step) return { result: step };
      return {
        write: {
          ...current,
          pending: {
            ...current.pending,
            steps: { ...current.pending.steps, [stepId]: next },
          },
          updatedAt: this.clock().toISOString(),
        },
        result: next,
      };
    });
  }

  private requirePending(
    supply: StoreSupply | null,
    purchase: StorePurchase,
  ): StoreSupplyPending {
    const pending = supply?.pending;
    if (!pending || pending.purchaseId !== purchase.id) {
      throw new ConflictException('Nenhuma geração em andamento.');
    }
    return pending;
  }

  private async view(
    purchase: StorePurchase,
    user: User,
    supply: StoreSupply | null,
  ): Promise<StoreMaterialView> {
    const content = supply?.current
      ? await this.supplies.findContent(supply.id, supply.current.generation)
      : null;
    const pending =
      supply?.pending?.purchaseId === purchase.id ? supply.pending : null;
    return {
      purchaseId: purchase.id,
      careerProfileAnswered: !!user.careerProfile,
      material: content?.module ?? null,
      ...(supply?.current ? { generatedAt: supply.current.finishedAt } : {}),
      chances: chancesFor(supply, purchase.id, this.clock()),
      pending: pending ? pendingView(pending) : null,
    };
  }

  /** Compra do próprio aluno, de módulo, dando acesso agora. */
  private async requireActive(
    userId: string,
    purchaseId: string,
  ): Promise<StorePurchase> {
    const purchase = await this.purchases.findById(purchaseId);
    // 404 também para a compra de outra pessoa: não confirma que ela existe.
    if (!purchase || purchase.userId !== userId) {
      throw new NotFoundException('Compra não encontrada.');
    }
    if (
      purchase.kind !== STORE_PRODUCT_KIND.MODULE ||
      !purchase.level ||
      !purchase.moduleId
    ) {
      throw new BadRequestException(
        'Esta compra não tem material personalizado.',
      );
    }
    if (!isPurchaseActive(purchase, this.clock())) {
      throw new ForbiddenException(EXPIRED_MATERIAL_MESSAGE);
    }
    return purchase;
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  /** Prompt-base do nível e o módulo comprado, como está no currículo hoje. */
  private async loadModule(purchase: StorePurchase): Promise<{
    basePrompt: string;
    module: Blueprint['modules'][number];
  }> {
    const [principal, level] = await Promise.all([
      this.curriculum.getPrincipal(),
      this.curriculum.getLevel(purchase.level!),
    ]);
    const module = this.curriculum
      .toBlueprint(level)
      .modules.find((m) => m.id === purchase.moduleId);
    if (!module || module.topics.length === 0) {
      throw new UnprocessableEntityException(
        'O módulo desta compra está sem tópicos no momento. Fale com o suporte.',
      );
    }
    return {
      basePrompt: composeBasePrompt(principal.prompt, level.prompt),
      module,
    };
  }
}

function pendingView(
  pending: StoreSupplyPending,
): NonNullable<StoreMaterialView['pending']> {
  return {
    number: pending.number,
    stuck: isPendingStuck(pending),
    steps: pending.order.map((id) => ({ id, ...pending.steps[id] })),
  };
}
