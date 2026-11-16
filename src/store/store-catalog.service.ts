import { Injectable, NotFoundException } from '@nestjs/common';
import { CurriculumService } from '../curriculum/curriculum.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { hasPaidAccess } from '../users/paid-access';
import { UserRepository } from '../users/user.repository';
import { StorePurchaseRepository } from './store-purchase.repository';
import {
  STORE_PURCHASE_STATUS,
  isPurchaseActive,
} from './store-purchase.model';
import { Level } from '../types/student.level';
import {
  STORE_FILE_STATUS,
  STORE_PRODUCT_KIND,
  StoreProduct,
  StoreProductKind,
} from './store-product.model';
import { StoreProductRepository } from './store-product.repository';
import {
  StoreContentRepository,
  TopicContentCount,
} from './store-content.repository';

/**
 * Vitrine pública (spec 032 §8): o que a landing e a loja mostram **antes** da
 * compra. Nada de conteúdo — nem caminho de arquivo, nem prompt ou contexto do
 * currículo, nem ids de tópico: só o suficiente para decidir comprar.
 */
export interface StoreProductSummary {
  id: string;
  kind: StoreProductKind;
  title: string;
  description: string;
  coverUrl?: string;
  price: number;
  maxInstallments: number;
  level?: Level;
  order: number;
  /** `module`: vídeos prontos e PDFs de apoio do módulo. */
  videoCount?: number;
  pdfCount?: number;
  /** `download`: quantos arquivos o comprador recebe. */
  fileCount?: number;
}

/** A vitrine vista por quem está logado: o que já é dele vem marcado. */
export interface StoreCatalogItem extends StoreProductSummary {
  /** Compra valendo agora: abre em "Meus módulos" em vez de comprar. */
  owned?: { purchaseId: string; accessUntil: string };
  /** Compra começada e não paga (PIX aguardando, cartão em desafio). */
  pendingPurchaseId?: string;
}

export interface StoreProductDetail extends StoreProductSummary {
  module?: {
    title: string;
    topics: { title: string; videoCount: number; pdfCount: number }[];
  };
  files?: { fileName: string; mimeType: string; size: number }[];
}

@Injectable()
export class StoreCatalogService {
  constructor(
    private readonly products: StoreProductRepository,
    private readonly content: StoreContentRepository,
    private readonly curriculum: CurriculumService,
    private readonly users: UserRepository,
    private readonly purchases: StorePurchaseRepository,
  ) {}

  /**
   * A vitrine do aluno logado (spec 032 §8). O assinante **não vê** os módulos
   * do próprio nível — já estão no plano dele (decisão 4) —, e o que a pessoa
   * já comprou vem marcado, para a tela abrir em vez de vender de novo.
   */
  async listForUser(requester: AuthenticatedUser): Promise<StoreCatalogItem[]> {
    const [products, user, mine] = await Promise.all([
      this.listPublished(),
      this.users.findById(requester.sub),
      this.purchases.findByUser(requester.sub),
    ]);
    const planLevel =
      user && user.level && hasPaidAccess(user) ? user.level : null;

    return products
      .filter(
        (p) =>
          !(
            planLevel &&
            p.kind === STORE_PRODUCT_KIND.MODULE &&
            p.level === planLevel
          ),
      )
      .map((p) => {
        const owned = mine.find(
          (c) => c.productId === p.id && isPurchaseActive(c),
        );
        const pending = mine.find(
          (c) =>
            c.productId === p.id && c.status === STORE_PURCHASE_STATUS.PENDING,
        );
        return {
          ...p,
          ...(owned
            ? {
                owned: {
                  purchaseId: owned.id,
                  accessUntil: owned.accessUntil!,
                },
              }
            : {}),
          ...(!owned && pending ? { pendingPurchaseId: pending.id } : {}),
        };
      });
  }

  async listPublished(): Promise<StoreProductSummary[]> {
    const products = (await this.products.findPublished()).sort(
      (a, b) => a.order - b.order,
    );

    // Uma leitura de currículo e de vídeos por nível, não por produto.
    const levels = [
      ...new Set(
        products
          .filter((p) => p.kind === STORE_PRODUCT_KIND.MODULE && p.level)
          .map((p) => p.level!),
      ),
    ];
    const byLevel = new Map(
      await Promise.all(
        levels.map(
          async (level) => [level, await this.levelContent(level)] as const,
        ),
      ),
    );

    return products.map((p) => {
      const summary = toSummary(p);
      if (p.kind !== STORE_PRODUCT_KIND.MODULE || !p.level) return summary;
      const totals = sumModule(byLevel.get(p.level), p.moduleId);
      return { ...summary, videoCount: totals.videos, pdfCount: totals.pdfs };
    });
  }

  async getPublished(id: string): Promise<StoreProductDetail> {
    const product = await this.products.findById(id);
    if (!product || !product.published) {
      throw new NotFoundException('Produto não encontrado.');
    }

    const summary = toSummary(product);
    if (product.kind === STORE_PRODUCT_KIND.DOWNLOAD) {
      return {
        ...summary,
        files: readyFiles(product).map((f) => ({
          fileName: f.fileName,
          mimeType: f.mimeType,
          size: f.size,
        })),
      };
    }

    const level = await this.levelContent(product.level!);
    const module = level.modules.find((m) => m.id === product.moduleId);
    const topics = (module?.topics ?? []).map((t) => {
      const count = level.counts.get(t.id) ?? { videos: 0, pdfs: 0 };
      return { title: t.title, videoCount: count.videos, pdfCount: count.pdfs };
    });
    return {
      ...summary,
      videoCount: topics.reduce((sum, t) => sum + t.videoCount, 0),
      pdfCount: topics.reduce((sum, t) => sum + t.pdfCount, 0),
      module: { title: module?.title ?? product.title, topics },
    };
  }

  private async levelContent(level: Level) {
    const [curriculum, counts] = await Promise.all([
      this.curriculum.getLevel(level),
      this.content.countByTopic(level),
    ]);
    return { modules: curriculum.modules, counts };
  }
}

function readyFiles(product: StoreProduct) {
  return product.files.filter((f) => f.status === STORE_FILE_STATUS.READY);
}

function toSummary(p: StoreProduct): StoreProductSummary {
  return {
    id: p.id,
    kind: p.kind,
    title: p.title,
    description: p.description,
    ...(p.cover ? { coverUrl: p.cover.url } : {}),
    price: p.price,
    maxInstallments: p.maxInstallments,
    ...(p.level ? { level: p.level } : {}),
    order: p.order,
    ...(p.kind === STORE_PRODUCT_KIND.DOWNLOAD
      ? { fileCount: readyFiles(p).length }
      : {}),
  };
}

function sumModule(
  level:
    | {
        modules: { id: string; topics: { id: string }[] }[];
        counts: Map<string, TopicContentCount>;
      }
    | undefined,
  moduleId: string | undefined,
): TopicContentCount {
  const module = level?.modules.find((m) => m.id === moduleId);
  return (module?.topics ?? []).reduce(
    (sum, t) => {
      const c = level!.counts.get(t.id);
      return c
        ? { videos: sum.videos + c.videos, pdfs: sum.pdfs + c.pdfs }
        : sum;
    },
    { videos: 0, pdfs: 0 },
  );
}
