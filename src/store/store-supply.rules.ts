import {
  STORE_GENERATION_INTERVAL_MS,
  STORE_MAX_GENERATIONS,
  STORE_MAX_STEP_ATTEMPTS,
  type StoreSupply,
  type StoreSupplyPending,
} from './store-supply.model';

export interface StoreChances {
  used: number;
  max: number;
  canGenerate: boolean;
  /** Quando libera a próxima. Ausente se já pode ou se acabaram. */
  nextAvailableAt?: string;
}

/**
 * Chances de gerar da compra `purchaseId` (spec 033 §0.1): 3 por compra, cada
 * uma liberada 6 h depois do **início** da anterior.
 *
 * As chances guardadas são de uma compra só. Se a compra atual é outra — a
 * renovação —, começa do zero. É isso que dispensa zerar o contador no
 * pagamento: a regra lê, não depende de alguém ter escrito.
 */
export function chancesFor(
  supply: Pick<StoreSupply, 'chances'> | null,
  purchaseId: string,
  now: Date = new Date(),
): StoreChances {
  const max = STORE_MAX_GENERATIONS;
  const own = supply?.chances.purchaseId === purchaseId ? supply.chances : null;
  const used = own?.used ?? 0;

  if (used >= max) return { used, max, canGenerate: false };
  if (used === 0 || !own?.lastStartedAt) {
    return { used, max, canGenerate: true };
  }

  const next =
    new Date(own.lastStartedAt).getTime() + STORE_GENERATION_INTERVAL_MS;
  return now.getTime() >= next
    ? { used, max, canGenerate: true }
    : {
        used,
        max,
        canGenerate: false,
        nextAvailableAt: new Date(next).toISOString(),
      };
}

/**
 * Geração sem saída: uma etapa falhou e já gastou todas as tentativas. Só ela
 * pode ser abandonada por uma geração nova — a que ainda tem tentativa é
 * retomada, para não queimar uma chance por uma aba fechada.
 */
export function isPendingStuck(
  pending: Pick<StoreSupplyPending, 'steps'>,
): boolean {
  return Object.values(pending.steps).some(
    (step) =>
      step.status !== 'done' && step.attempts >= STORE_MAX_STEP_ATTEMPTS,
  );
}
