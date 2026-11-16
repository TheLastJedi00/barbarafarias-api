import { Level } from '../types/student.level';
import { StoreProductKind } from './store-product.model';

/**
 * Ciclo de vida da compra (spec 032 §3):
 *
 * `PENDING` → order criada, aguardando o pagamento
 * `PAID` → pago; libera o acesso até `accessUntil`
 * `REFUNDED` → desistência (comprador, ≤ 7 dias) ou reembolso da gerente
 * `CHARGED_BACK` → contestação no cartão
 * `CANCELLED` → order expirou ou foi recusada sem pagamento
 *
 * Só `PAID` com `accessUntil` no futuro dá acesso — a regra é calculada a cada
 * pedido, então vencimento e reembolso cortam na hora, sem job.
 */
export const STORE_PURCHASE_STATUS = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  REFUNDED: 'REFUNDED',
  CHARGED_BACK: 'CHARGED_BACK',
  CANCELLED: 'CANCELLED',
} as const;

export type StorePurchaseStatus =
  (typeof STORE_PURCHASE_STATUS)[keyof typeof STORE_PURCHASE_STATUS];

export type StorePaymentMethod = 'PIX' | 'CREDIT_CARD';

export interface StorePurchase {
  id: string;
  userId: string;
  productId: string;
  kind: StoreProductKind;
  level?: Level;
  moduleId?: string;
  /** Título e preço no momento da compra: o produto pode mudar depois. */
  titleSnapshot: string;
  priceSnapshot: number;
  installments: number;
  method: StorePaymentMethod;
  status: StorePurchaseStatus;
  gateway: { orderId?: string };
  termsVersion: string;
  paidAt?: string; // ISO
  accessUntil?: string; // ISO
  /**
   * `gateway`: o estorno chegou pelo webhook sem ter saído daqui (painel do
   * Mercado Pago, por exemplo).
   */
  refund?: { by: 'buyer' | 'manager' | 'gateway'; at: string; reason?: string };
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/** Prazo de desistência do comprador (CDC art. 49), contado do pagamento. */
export const STORE_WITHDRAWAL_DAYS = 7;

/** Até quando o Mercado Pago aceita estorno de uma order aprovada. */
export const STORE_REFUND_LIMIT_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

/** A compra está dando acesso agora? */
export function isPurchaseActive(
  purchase: Pick<StorePurchase, 'status' | 'accessUntil'>,
  now: Date = new Date(),
): boolean {
  return (
    purchase.status === STORE_PURCHASE_STATUS.PAID &&
    !!purchase.accessUntil &&
    new Date(purchase.accessUntil).getTime() > now.getTime()
  );
}
