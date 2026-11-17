import {
  STORE_PURCHASE_STATUS,
  StorePurchase,
  addDays,
  isPurchaseActive,
} from './store-purchase.model';
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

/** Dias que o material vencido fica guardado antes de poder ser apagado. */
export const STORE_SUPPLY_RETENTION_DAYS = 30;

export type SupplyEndReason = 'expired' | 'refunded' | 'charged_back';

export type SupplyEndState =
  | { active: true }
  | {
      active: false;
      reason: SupplyEndReason;
      endedAt: string;
      /** A partir de quando a gerente pode apagar (fim + 30 dias). */
      deletableAt: string;
      deletable: boolean;
    };

/**
 * Situação do material a partir das compras da pessoa **daquele produto**
 * (spec 033 §0.2). Calculada, nunca gravada: vencer é passar de uma data, e
 * nada avisa quando isso acontece — como o acesso da 032.
 *
 * Basta uma compra valendo para o material estar ativo. Senão, quem manda é a
 * compra que terminou por último: o fim é o `accessUntil` (vencida), a data do
 * estorno (reembolso) ou a última atualização (contestação). Compras que
 * nunca foram pagas não contam. `fallback` cobre o material sem compra paga
 * nenhuma, que não deveria existir.
 */
export function supplyEndState(
  purchases: StorePurchase[],
  now: Date = new Date(),
  fallback = now.toISOString(),
): SupplyEndState {
  if (purchases.some((p) => isPurchaseActive(p, now))) return { active: true };

  const ends = purchases.flatMap((p): [string, SupplyEndReason][] => {
    switch (p.status) {
      case STORE_PURCHASE_STATUS.PAID:
        return p.accessUntil ? [[p.accessUntil, 'expired']] : [];
      case STORE_PURCHASE_STATUS.REFUNDED:
        return [[p.refund?.at ?? p.updatedAt, 'refunded']];
      case STORE_PURCHASE_STATUS.CHARGED_BACK:
        return [[p.updatedAt, 'charged_back']];
      default:
        return [];
    }
  });
  const [endedAt, reason] = ends.sort(([a], [b]) => b.localeCompare(a))[0] ?? [
    fallback,
    'expired',
  ];
  const deletableAt = addDays(endedAt, STORE_SUPPLY_RETENTION_DAYS);
  return {
    active: false,
    reason,
    endedAt,
    deletableAt,
    deletable: now.getTime() >= new Date(deletableAt).getTime(),
  };
}
