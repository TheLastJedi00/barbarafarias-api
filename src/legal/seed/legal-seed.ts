import type { LegalDocumentType } from '../legal.model';
import { PRIVACY_POLICY_SEED } from './privacy-policy.seed';
import { RECRUITMENT_SEED } from './recruitment.seed';
import { TERMS_OF_USE_SEED } from './terms-of-use.seed';

/** Texto inicial de um documento, publicado como `1.0` pela semeadura. */
export interface LegalSeed {
  type: LegalDocumentType;
  title: string;
  markdown: string;
}

/**
 * Os três documentos da v1.0 (spec 029 §5). O do recrutamento é o mesmo texto
 * da spec 028 e mantém o número `1.0`: quem se cadastrou antes continua em dia.
 */
export const LEGAL_SEEDS: readonly LegalSeed[] = [
  TERMS_OF_USE_SEED,
  PRIVACY_POLICY_SEED,
  RECRUITMENT_SEED,
];
