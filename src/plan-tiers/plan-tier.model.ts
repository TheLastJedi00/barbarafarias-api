import { addDays, toZonedDateString, zonedDateTimeToUtc } from '../common/time';

/**
 * Tiers de plano (spec 035): o plano deixou de ser um serviço em três prazos e
 * passou a ser **três serviços**, com preço definido pela gerente.
 *
 * Os ids são fixos de propósito. Criar um tier é mudança de produto e de
 * contrato — não cabe num formulário. A gerente edita o conteúdo e o preço.
 */
export const PLAN_TIER_IDS = {
  PRIVATE: 'private',
  WEEKLY_GROUP: 'weekly-group',
  MONTHLY_GROUP: 'monthly-group',
} as const;

export type PlanTierId = (typeof PLAN_TIER_IDS)[keyof typeof PLAN_TIER_IDS];

export const PLAN_TIER_ID_LIST: PlanTierId[] = Object.values(PLAN_TIER_IDS);

export function isPlanTierId(value: unknown): value is PlanTierId {
  return PLAN_TIER_ID_LIST.includes(value as PlanTierId);
}

/** Quantos meses o pacote compra. */
export const PACKAGE_MONTHS = 6;
/** Quantos meses a assinatura prende antes de poder ser cancelada. */
export const FIDELITY_MONTHS = 6;

/**
 * Preço que a gerente agendou. Vale a partir de `effectiveAt` (a meia-noite de
 * Brasília seguinte ao pedido), e quem decide se já vale é a **leitura**, não
 * o cron — ver `effectiveTier`.
 */
export interface PendingPrice {
  packagePrice: number | null;
  monthlyPrice: number | null;
  /** ISO do instante em que passa a valer. */
  effectiveAt: string;
  requestedBy: string;
  requestedAt: string;
}

export interface PlanTier {
  id: PlanTierId;
  name: string;
  description: string;
  benefits: string[];
  /** Preço à vista do pacote de 6 meses, em reais. `null` = nunca definido. */
  packagePrice: number | null;
  /** Mensalidade da assinatura. `null` = o tier não vende assinatura. */
  monthlyPrice: number | null;
  active: boolean;
  pending?: PendingPrice | null;
  updatedAt: string;
  updatedBy: string;
}

/** O que a vitrine pública recebe: catálogo, sem nada interno. */
export interface PublicPlanTier {
  id: PlanTierId;
  name: string;
  description: string;
  benefits: string[];
  packagePrice: number | null;
  monthlyPrice: number | null;
  packageMonths: number;
  fidelityMonths: number;
}

const INCLUDED = 'Vídeo aulas, materiais e materiais de apoio';

/**
 * Seed sob demanda. Nasce **inativo e sem preço**: uma vitrine aberta com um
 * preço que ninguém definiu seria venda pelo valor errado.
 */
export const DEFAULT_TIERS: Record<PlanTierId, PlanTier> = {
  [PLAN_TIER_IDS.PRIVATE]: {
    id: PLAN_TIER_IDS.PRIVATE,
    name: 'Consultoria Particular Premium',
    description:
      'Aulas particulares com uma professora dedicada, que acompanha o seu desenvolvimento.',
    benefits: [
      '1 aula de conversação particular por semana',
      'Professora dedicada acompanhando o seu desenvolvimento',
      INCLUDED,
    ],
    packagePrice: null,
    monthlyPrice: null,
    active: false,
    pending: null,
    updatedAt: '',
    updatedBy: '',
  },
  [PLAN_TIER_IDS.WEEKLY_GROUP]: {
    id: PLAN_TIER_IDS.WEEKLY_GROUP,
    name: 'Conversação semanal em grupo',
    description:
      'Conversação em turma toda semana e um encontro mensal com a fundadora.',
    benefits: [
      '1 aula em grupo por semana com uma professora',
      '1 aula em grupo por mês com a fundadora',
      INCLUDED,
    ],
    packagePrice: null,
    monthlyPrice: null,
    active: false,
    pending: null,
    updatedAt: '',
    updatedBy: '',
  },
  [PLAN_TIER_IDS.MONTHLY_GROUP]: {
    id: PLAN_TIER_IDS.MONTHLY_GROUP,
    name: 'Conversação mensal em grupo',
    description: 'Dois encontros de conversação em turma por mês.',
    benefits: [
      '1 aula em grupo por mês com uma professora',
      '1 aula em grupo por mês com a fundadora',
      INCLUDED,
    ],
    packagePrice: null,
    monthlyPrice: null,
    active: false,
    pending: null,
    updatedAt: '',
    updatedBy: '',
  },
};

/**
 * O tier com o preço que vale **agora**.
 *
 * É aqui, e não no cron, que a vigência é decidida. No plano Hobby a Vercel
 * dispara o cron em qualquer minuto da hora marcada, e uma execução pode
 * falhar: se o preço dependesse dele, a vitrine e a cobrança passariam a
 * meia-noite com o valor velho. O cron só consolida o documento.
 */
export function effectiveTier(
  tier: PlanTier,
  now: Date = new Date(),
): PlanTier {
  const pending = tier.pending;
  if (!pending || pending.effectiveAt > now.toISOString()) {
    return { ...tier, benefits: [...tier.benefits] };
  }
  return {
    ...tier,
    benefits: [...tier.benefits],
    packagePrice: pending.packagePrice,
    monthlyPrice: pending.monthlyPrice,
    pending: null,
  };
}

/** Ativo e com preço do pacote. É a condição para aparecer e para vender. */
export function isSellable(tier: PlanTier): boolean {
  return (
    tier.active &&
    typeof tier.packagePrice === 'number' &&
    tier.packagePrice > 0
  );
}

/** A próxima meia-noite de Brasília estritamente depois de `now`. */
export function nextPriceEffectiveAt(now: Date = new Date()): Date {
  const amanha = addDays(toZonedDateString(now), 1);
  return zonedDateTimeToUtc(amanha, 0);
}

/** Teto do cache da vitrine: mudanças que valem na hora aparecem em até 1 h. */
export const PUBLIC_CACHE_MAX_SECONDS = 3600;

/**
 * Por quanto tempo o CDN pode guardar a vitrine: até a próxima meia-noite de
 * Brasília (quando um preço agendado pode entrar), com teto de 1 h. Nunca
 * zero — `s-maxage=0` vira "não guarde" e a virada seria uma rajada na função.
 */
export function cacheSecondsUntilPriceChange(now: Date = new Date()): number {
  const ate = Math.floor(
    (nextPriceEffectiveAt(now).getTime() - now.getTime()) / 1000,
  );
  return Math.max(1, Math.min(PUBLIC_CACHE_MAX_SECONDS, ate));
}

export function publicTierView(tier: PlanTier): PublicPlanTier {
  return {
    id: tier.id,
    name: tier.name,
    description: tier.description,
    benefits: [...tier.benefits],
    packagePrice: tier.packagePrice,
    monthlyPrice: tier.monthlyPrice,
    packageMonths: PACKAGE_MONTHS,
    fidelityMonths: FIDELITY_MONTHS,
  };
}
