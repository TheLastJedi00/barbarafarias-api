import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CurriculumService } from '../curriculum/curriculum.service';
import { StorageService } from '../uploads/storage.service';
import {
  CreateStoreFileDto,
  CreateStoreProductDto,
  ReorderStoreProductsDto,
  StoreCoverDto,
  UpdateStoreProductDto,
} from './dto/store-product.dto';
import {
  MAX_FILES_PER_PRODUCT,
  MAX_STORE_FILE_BYTES,
  STORE_FILE_EXTENSION_BY_MIME,
  STORE_FILE_STATUS,
  STORE_MAX_INSTALLMENTS,
  STORE_PRODUCT_KIND,
  StoreCover,
  StoreProduct,
  StoreProductFile,
  productStoragePrefix,
} from './store-product.model';
import { STORE_PURCHASE_STATUS } from './store-purchase.model';
import { StoreProductRepository } from './store-product.repository';
import { StorePurchaseRepository } from './store-purchase.repository';

/** Pasta de upload das capas (só a gerente sobe nela). */
const COVER_FOLDER = 'store/';

/**
 * Catálogo da loja do ponto de vista da gerente (spec 032 §9): cria, edita,
 * publica, ordena e apaga produtos, e sobe os arquivos dos produtos `download`.
 */
@Injectable()
export class StoreAdminService {
  constructor(
    private readonly products: StoreProductRepository,
    private readonly purchases: StorePurchaseRepository,
    private readonly curriculum: CurriculumService,
    private readonly storage: StorageService,
  ) {}

  async list(): Promise<StoreProduct[]> {
    return (await this.products.findAll()).sort(byOrder);
  }

  async get(id: string): Promise<StoreProduct> {
    return this.getOrThrow(id);
  }

  async create(dto: CreateStoreProductDto): Promise<StoreProduct> {
    const all = await this.products.findAll();

    if (dto.kind === STORE_PRODUCT_KIND.MODULE) {
      if (!dto.level || !dto.moduleId) {
        throw new BadRequestException(
          'Escolha o nível e o módulo do currículo.',
        );
      }
      const curriculum = await this.curriculum.getLevel(dto.level);
      if (!curriculum.modules.some((m) => m.id === dto.moduleId)) {
        throw new NotFoundException('Módulo não encontrado neste nível.');
      }
      if (all.some((p) => p.moduleId === dto.moduleId)) {
        throw new ConflictException('Este módulo já está na loja.');
      }
    } else if (dto.moduleId) {
      throw new BadRequestException(
        'Material para download não fica preso a um módulo.',
      );
    }

    if (dto.published && dto.kind === STORE_PRODUCT_KIND.DOWNLOAD) {
      throw new BadRequestException(
        'Envie ao menos um arquivo antes de publicar.',
      );
    }

    const now = new Date().toISOString();
    const product: StoreProduct = {
      id: this.products.newId(),
      kind: dto.kind,
      title: dto.title.trim(),
      description: dto.description?.trim() ?? '',
      ...(dto.cover ? { cover: assertCover(dto.cover) } : {}),
      price: dto.price,
      maxInstallments: dto.maxInstallments ?? STORE_MAX_INSTALLMENTS,
      published: dto.published ?? false,
      order: all.reduce((max, p) => Math.max(max, p.order + 1), 0),
      ...(dto.level ? { level: dto.level } : {}),
      ...(dto.kind === STORE_PRODUCT_KIND.MODULE
        ? { moduleId: dto.moduleId }
        : {}),
      files: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.products.save(product);
    return product;
  }

  async update(id: string, dto: UpdateStoreProductDto): Promise<StoreProduct> {
    const product = await this.getOrThrow(id);
    const isModule = product.kind === STORE_PRODUCT_KIND.MODULE;

    if (dto.level !== undefined && isModule && dto.level !== product.level) {
      throw new BadRequestException(
        'O nível de um módulo não muda. Crie outro produto.',
      );
    }

    const updated: StoreProduct = {
      ...product,
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(dto.price !== undefined ? { price: dto.price } : {}),
      ...(dto.maxInstallments !== undefined
        ? { maxInstallments: dto.maxInstallments }
        : {}),
      ...(dto.published !== undefined ? { published: dto.published } : {}),
      updatedAt: new Date().toISOString(),
    };

    if (dto.cover === null) delete updated.cover;
    else if (dto.cover) updated.cover = assertCover(dto.cover);

    if (!isModule && dto.level !== undefined) {
      if (dto.level === null) delete updated.level;
      else updated.level = dto.level;
    }

    if (updated.published && !isModule && !hasReadyFile(updated)) {
      throw new BadRequestException(
        'Envie ao menos um arquivo antes de publicar.',
      );
    }

    await this.products.save(updated);
    if (
      dto.cover !== undefined &&
      product.cover?.path !== updated.cover?.path
    ) {
      if (product.cover) await this.storage.remove(product.cover.path);
    }
    return updated;
  }

  /**
   * Produto vendido não se apaga: a compra aponta para ele e o comprador
   * perderia o acesso. Para tirar da vitrine, despublica.
   */
  async remove(id: string): Promise<void> {
    const product = await this.getOrThrow(id);
    const sold = (await this.purchases.findByProduct(id)).some(
      (p) =>
        p.status !== STORE_PURCHASE_STATUS.CANCELLED &&
        p.status !== STORE_PURCHASE_STATUS.PENDING,
    );
    if (sold) {
      throw new ConflictException(
        'Este produto já foi vendido. Despublique em vez de apagar.',
      );
    }
    await this.storage.removePrefix(productStoragePrefix(id));
    if (product.cover) await this.storage.remove(product.cover.path);
    await this.products.delete(id);
  }

  async reorder(dto: ReorderStoreProductsDto): Promise<void> {
    const all = await this.products.findAll();
    const ids = new Set(all.map((p) => p.id));
    const sameSet =
      dto.ids.length === ids.size &&
      new Set(dto.ids).size === ids.size &&
      dto.ids.every((id) => ids.has(id));
    if (!sameSet) {
      throw new BadRequestException(
        'Envie a lista completa de produtos, sem repetir.',
      );
    }
    await this.products.saveOrders(
      dto.ids.map((id, order) => ({ id, order })),
      new Date().toISOString(),
    );
  }

  async addFile(
    id: string,
    dto: CreateStoreFileDto,
    origin?: string,
  ): Promise<{ file: StoreProductFile; uploadUrl: string }> {
    const product = await this.getOrThrow(id);
    if (product.kind !== STORE_PRODUCT_KIND.DOWNLOAD) {
      throw new BadRequestException(
        'Arquivos para baixar só existem em material para download.',
      );
    }
    const extension = STORE_FILE_EXTENSION_BY_MIME[dto.mimeType];
    if (!extension) {
      throw new BadRequestException(
        'Tipo de arquivo não aceito. Use PDF, Word, PowerPoint, Excel, MP3, M4A, JPG, PNG ou ZIP.',
      );
    }
    if (dto.size > MAX_STORE_FILE_BYTES) {
      throw new BadRequestException('O arquivo passa do limite de 100 MB.');
    }
    if (product.files.length >= MAX_FILES_PER_PRODUCT) {
      throw new BadRequestException(
        `Cada produto aceita até ${MAX_FILES_PER_PRODUCT} arquivos.`,
      );
    }

    const fileId = randomUUID();
    const file: StoreProductFile = {
      id: fileId,
      fileName: dto.fileName,
      storagePath: `${productStoragePrefix(id)}files/${fileId}.${extension}`,
      mimeType: dto.mimeType,
      size: dto.size,
      status: STORE_FILE_STATUS.UPLOADING,
      uploadedAt: new Date().toISOString(),
    };
    const uploadUrl = await this.storage.createUploadSession(
      file.storagePath,
      dto.mimeType,
      origin,
    );
    await this.products.save({
      ...product,
      files: [...product.files, file],
      updatedAt: new Date().toISOString(),
    });
    return { file, uploadUrl };
  }

  /** Confere no bucket o que chegou: vale o objeto, não o que o navegador disse. */
  async completeFile(id: string, fileId: string): Promise<StoreProductFile> {
    const product = await this.getOrThrow(id);
    const file = findFile(product, fileId);
    if (file.status === STORE_FILE_STATUS.READY) return file;

    const info = await this.storage.getObjectInfo(file.storagePath);
    if (!info) {
      throw new ConflictException(
        'O arquivo ainda não chegou ao armazenamento. Envie de novo.',
      );
    }
    if (info.size > MAX_STORE_FILE_BYTES) {
      await this.storage.remove(file.storagePath);
      await this.products.save({
        ...product,
        files: product.files.filter((f) => f.id !== fileId),
        updatedAt: new Date().toISOString(),
      });
      throw new BadRequestException('O arquivo passa do limite de 100 MB.');
    }

    const ready: StoreProductFile = {
      ...file,
      size: info.size,
      status: STORE_FILE_STATUS.READY,
      uploadedAt: new Date().toISOString(),
    };
    await this.products.save({
      ...product,
      files: product.files.map((f) => (f.id === fileId ? ready : f)),
      updatedAt: new Date().toISOString(),
    });
    return ready;
  }

  async removeFile(id: string, fileId: string): Promise<void> {
    const product = await this.getOrThrow(id);
    const file = findFile(product, fileId);
    const remaining = product.files.filter((f) => f.id !== fileId);
    if (
      product.published &&
      !remaining.some((f) => f.status === STORE_FILE_STATUS.READY)
    ) {
      throw new ConflictException(
        'Este é o último arquivo de um produto publicado. Despublique antes.',
      );
    }
    await this.storage.remove(file.storagePath);
    await this.products.save({
      ...product,
      files: remaining,
      updatedAt: new Date().toISOString(),
    });
  }

  private async getOrThrow(id: string): Promise<StoreProduct> {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundException('Produto não encontrado.');
    return product;
  }
}

function byOrder(a: { order: number }, b: { order: number }): number {
  return a.order - b.order;
}

function hasReadyFile(product: StoreProduct): boolean {
  return product.files.some((f) => f.status === STORE_FILE_STATUS.READY);
}

function findFile(product: StoreProduct, fileId: string): StoreProductFile {
  const file = product.files.find((f) => f.id === fileId);
  if (!file) throw new NotFoundException('Arquivo não encontrado.');
  return file;
}

/**
 * Só imagem que a própria API gravou em `store/`: a URL tem de ser a do
 * Storage para aquele caminho (mesma régua das artes da spec 031).
 */
function assertCover(cover: StoreCoverDto): StoreCover {
  const ok =
    cover.path.startsWith(COVER_FOLDER) &&
    !cover.path.includes('..') &&
    cover.url.startsWith('https://firebasestorage.googleapis.com/') &&
    cover.url.includes(`/o/${encodeURIComponent(cover.path)}?`);
  if (!ok) throw new BadRequestException('Capa inválida.');
  return { url: cover.url, path: cover.path };
}
