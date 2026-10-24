import { TERMS_V1_0 } from './versions/v1-0';

/** Uma versão publicada do termo do Trabalhe Conosco (spec 028 §4). */
export interface RecruitmentTerms {
  version: string;
  title: string;
  /** `YYYY-MM-DD` — a partir de quando vale. */
  effectiveDate: string;
  /** Texto em Markdown; o front renderiza. */
  markdown: string;
}

/**
 * Todas as versões publicadas, da mais antiga para a mais nova. **A última é
 * a vigente.** É a única fonte do texto: o front busca por
 * `GET /recruitment/terms` e o aceite grava a versão daqui.
 *
 * Para publicar uma versão nova:
 * 1. crie `versions/vX-Y.ts` com o texto e a versão nova;
 * 2. acrescente-a ao fim desta lista.
 *
 * Só isso — quem aceitou a anterior passa a ver o pedido de novo aceite no
 * painel, e as antigas continuam em `GET /recruitment/terms/:version`.
 */
export const RECRUITMENT_TERMS: readonly RecruitmentTerms[] = [TERMS_V1_0];

export function currentTerms(): RecruitmentTerms {
  return RECRUITMENT_TERMS[RECRUITMENT_TERMS.length - 1];
}

export function termsByVersion(version: string): RecruitmentTerms | null {
  return RECRUITMENT_TERMS.find((t) => t.version === version) ?? null;
}
