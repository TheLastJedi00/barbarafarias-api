import { Level } from '../types/student.level';

/**
 * O que a loja vende (spec 032 §3):
 *
 * - `module`: um módulo do currículo — vídeo aulas + PDFs de apoio, só leitura,
 *   por {@link STORE_ACCESS_DAYS} dias;
 * - `download`: material avulso que a gerente sobe para o comprador baixar.
 */
export const STORE_PRODUCT_KIND = {
  MODULE: 'module',
  DOWNLOAD: 'download',
} as const;

export type StoreProductKind =
  (typeof STORE_PRODUCT_KIND)[keyof typeof STORE_PRODUCT_KIND];

export const STORE_PRODUCT_KINDS = Object.values(STORE_PRODUCT_KIND);

/** Validade de toda compra da loja, módulo ou download (spec 032 decisões 2 e 12). */
export const STORE_ACCESS_DAYS = 90;

/** Teto de parcelas no cartão, juros do comprador (spec 032 decisão 3). */
export const STORE_MAX_INSTALLMENTS = 12;

/** Arquivos de um produto `download`. */
export const MAX_STORE_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_FILES_PER_PRODUCT = 10;

export const STORE_FILE_STATUS = {
  UPLOADING: 'uploading',
  READY: 'ready',
} as const;

export type StoreFileStatus =
  (typeof STORE_FILE_STATUS)[keyof typeof STORE_FILE_STATUS];

export interface StoreProductFile {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  size: number;
  status: StoreFileStatus;
  uploadedAt: string; // ISO
}

/** Capa: imagem que a própria API gravou em `store/` (pasta da gerente). */
export interface StoreCover {
  url: string;
  path: string;
}

export interface StoreProduct {
  id: string;
  kind: StoreProductKind;
  title: string;
  description: string;
  cover?: StoreCover;
  /** Preço à vista, em reais. O parcelado tem juros do comprador. */
  price: number;
  maxInstallments: number;
  published: boolean;
  /** Posição na vitrine. */
  order: number;
  /**
   * `module`: nível do módulo. `download`: opcional, só para o filtro da
   * vitrine (spec 032 §11 — o material para download é solto).
   */
  level?: Level;
  /** `module`: id do módulo no `curriculum/<level>`. */
  moduleId?: string;
  /** `download`: os arquivos para baixar. */
  files: StoreProductFile[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/** Prefixo de tudo o que pertence a um produto no Storage. */
export function productStoragePrefix(productId: string): string {
  return `store-products/${productId}/`;
}

/** Tipos aceitos nos arquivos para download. */
export const STORE_FILE_EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
};
