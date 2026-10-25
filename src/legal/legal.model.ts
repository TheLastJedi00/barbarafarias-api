import { ROLES, type Role } from '../types/role';

/**
 * Documentos do Painel Jurídico (spec 029). Lista fechada: tipo fora daqui é
 * 404, e cada um tem quem precisa aceitá-lo.
 */
export const LEGAL_DOCUMENT_TYPES = [
  'terms-of-use',
  'privacy-policy',
  'recruitment',
] as const;
export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

export function isLegalDocumentType(value: string): value is LegalDocumentType {
  return (LEGAL_DOCUMENT_TYPES as readonly string[]).includes(value);
}

/** Título padrão de cada documento, antes da primeira publicação. */
export const LEGAL_DOCUMENT_TITLES: Record<LegalDocumentType, string> = {
  'terms-of-use': 'Termos de Uso',
  'privacy-policy': 'Política de Privacidade',
  recruitment:
    'Termo de Privacidade e Tratamento de Dados Pessoais — Processo Seletivo',
};

/**
 * O que cada papel precisa aceitar (context §3). Todo usuário aceita Termos de
 * Uso e Política de Privacidade; o candidato, também o termo do recrutamento.
 */
export function requiredTypesFor(role: Role): LegalDocumentType[] {
  return role === ROLES.CANDIDATE
    ? ['terms-of-use', 'privacy-policy', 'recruitment']
    : ['terms-of-use', 'privacy-policy'];
}

/** Cabeçalho do documento, em `legalDocuments/{type}`. */
export interface LegalDocument {
  type: LegalDocumentType;
  title: string;
  /** Última versão publicada (a vigente), ou `null` antes da primeira. */
  publishedVersion: string | null;
  /**
   * Última versão publicada que **exigiu novo aceite**. Quem aceitou uma
   * versão ≥ esta está em dia; correção de texto não incomoda ninguém.
   */
  requiredVersion: string | null;
  updatedAt: string;
}

/** Versão publicada, em `legalDocuments/{type}/versions/{version}`. Imutável. */
export interface LegalVersion {
  type: LegalDocumentType;
  version: string;
  title: string;
  markdown: string;
  /** `YYYY-MM-DD`. */
  effectiveDate: string;
  requiresReacceptance: boolean;
  changeNote?: string;
  publishedAt: string;
  publishedBy: string;
}

/** Rascunho em edição, doc único em `legalDocuments/{type}/drafts/current`. */
export interface LegalDraft {
  type: LegalDocumentType;
  title: string;
  markdown: string;
  /** Versão de onde o rascunho partiu, ou `null` se começou do zero. */
  basedOnVersion: string | null;
  updatedAt: string;
  updatedBy: string;
}

/**
 * Prova do aceite, em `legalAcceptances/{userId}_{type}_{version}`. O id
 * determinístico faz aceitar duas vezes a mesma versão cair no mesmo doc.
 */
export interface LegalAcceptance {
  id: string;
  userId: string;
  role: Role;
  type: LegalDocumentType;
  version: string;
  acceptedAt: string;
  ip: string;
  userAgent: string;
}

export function acceptanceId(
  userId: string,
  type: LegalDocumentType,
  version: string,
): string {
  return `${userId}_${type}_${version}`;
}
