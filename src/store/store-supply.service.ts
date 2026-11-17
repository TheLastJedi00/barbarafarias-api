import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CurriculumService,
  type Blueprint,
} from '../curriculum/curriculum.service';
import { GeminiProvider } from '../supply/gemini/gemini.service';
import { composeBasePrompt } from '../supply/prompts';
import type { Module } from '../types/student.supply';
import { UserRepository } from '../users/user.repository';
import type { User } from '../users/user.entity';
import { STORE_PRODUCT_KIND } from './store-product.model';
import { StorePurchase, isPurchaseActive } from './store-purchase.model';
import { StorePurchaseRepository } from './store-purchase.repository';
import {
  INTRO_STEP,
  StoreSupply,
  StoreSupplyPending,
  StoreSupplyStep,
  StoreSupplyStepStatus,
  storeSupplyId,
} from './store-supply.model';
import { StoreSupplyRepository } from './store-supply.repository';
import { StoreChances, chancesFor, isPendingStuck } from './store-supply.rules';

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

  // ------------------------------------------------------------- internos

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
