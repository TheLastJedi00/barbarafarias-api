import type { CareerProfile } from '../users/career-profile';
import type { Level } from '../types/student.level';
import type { Module, Topic } from '../types/student.supply';

/**
 * Material personalizado da loja (spec 033).
 *
 * **É da pessoa e do produto, não da compra:** o id é `{userId}_{productId}`.
 * É o que deixa a renovação (uma compra nova do mesmo produto) reencontrar o
 * material antigo sem migrar nada.
 *
 * O cabeçalho mora em `storeSupplies`; o conteúdo, em `storeSupplyModules`, um
 * doc por geração (`{id}_{número}`). Separar respeita o teto de 1 MiB por doc e
 * permite trocar o material vigente de uma vez ao fim de uma geração nova.
 */

/** Gerações por compra (spec 033 §0.1). */
export const STORE_MAX_GENERATIONS = 3;

/** Intervalo entre o início de uma geração e a liberação da seguinte. */
export const STORE_GENERATION_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Tentativas por etapa dentro de uma geração. Refazer uma etapa que falhou não
 * gasta uma geração, mas custa uma chamada ao Gemini: este é o freio.
 */
export const STORE_MAX_STEP_ATTEMPTS = 3;

/** Etapa da introdução do módulo; as outras etapas são os ids dos tópicos. */
export const INTRO_STEP = 'intro';

export type StoreSupplyStepStatus = 'pending' | 'done' | 'failed';

export interface StoreSupplyStep {
  title: string;
  status: StoreSupplyStepStatus;
  attempts: number;
}

/** Geração em andamento. Some do cabeçalho quando termina. */
export interface StoreSupplyPending {
  number: number;
  purchaseId: string;
  startedAt: string; // ISO
  moduleTitle: string;
  /** Cópia das respostas usadas: o perfil pode mudar no meio da geração. */
  careerProfile: CareerProfile;
  /** Ordem das etapas: `intro` primeiro, depois os tópicos do currículo. */
  order: string[];
  steps: Record<string, StoreSupplyStep>;
}

export interface StoreSupply {
  id: string;
  userId: string;
  productId: string;
  level: Level;
  moduleId: string;
  /**
   * Chances da compra `purchaseId`. Compra diferente (renovação) começa com
   * zero usadas: o contador não precisa ser zerado no pagamento.
   */
  chances: { purchaseId: string; used: number; lastStartedAt?: string };
  /** Último número de geração aberto; numera os docs de conteúdo. */
  lastGeneration: number;
  /** Material que a pessoa lê. Ausente até a primeira geração terminar. */
  current?: { generation: number; finishedAt: string };
  pending?: StoreSupplyPending;
  createdAt: string;
  updatedAt: string;
}

/** Doc de conteúdo de uma geração (`storeSupplyModules`). */
export interface StoreSupplyContent {
  supplyId: string;
  generation: number;
  /** Etapas prontas: a intro (texto) e cada tópico. */
  steps: Record<string, string | Topic>;
  /** Montado no fim da geração, na ordem do currículo. */
  module?: Module;
}

export function storeSupplyId(userId: string, productId: string): string {
  return `${userId}_${productId}`;
}

export function storeSupplyContentId(
  supplyId: string,
  generation: number,
): string {
  return `${supplyId}_${generation}`;
}
