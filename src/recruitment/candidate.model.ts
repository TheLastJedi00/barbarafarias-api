import { compareVersions } from '../legal/legal-version';

/**
 * Versões do termo do recrutamento, lidas do módulo `legal` (spec 029): a
 * vigente (a que o aceite grava) e a exigida (a última que pediu novo aceite).
 */
export interface TermsRequirement {
  publishedVersion: string | null;
  requiredVersion: string | null;
}

/** Currículo: só PDF, até 5 MB (spec 028 §10). */
export const RESUME_MIME_TYPE = 'application/pdf';
export const RESUME_MAX_BYTES = 5 * 1024 * 1024;

export interface ResumeFile {
  storagePath: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

/** Candidato do Trabalhe Conosco, em `candidates/{uid}`. */
export interface Candidate {
  id: string;
  email: string;
  name: string;
  /** Só dígitos, com DDD — a máscara é da tela. */
  phone: string;
  linkedinUrl?: string;
  resume?: ResumeFile;
  /**
   * Sessão de upload emitida e ainda não confirmada. O currículo vigente só é
   * trocado no `complete`, depois de conferir o que chegou ao bucket.
   */
  pendingResume?: Omit<ResumeFile, 'uploadedAt'>;
  consentAt: string;
  consentVersion: string;
  createdAt: string;
  updatedAt: string;
}

/** O que sai pela API: sem caminhos do Storage nem a sessão pendente. */
export interface CandidateView {
  id: string;
  email: string;
  name: string;
  phone: string;
  linkedinUrl?: string;
  resume?: Pick<ResumeFile, 'fileName' | 'size' | 'uploadedAt'>;
  consentAt: string;
  consentVersion: string;
  /** Versão vigente do termo, para o front pedir novo aceite. */
  termsVersion: string;
  needsConsent: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Precisa aceitar de novo quem aceitou uma versão anterior à exigida. Correção
 * sem novo aceite (`1.1`) não incomoda quem aceitou a `1.0`; sem versão
 * exigida (termo não publicado), ninguém fica pendente.
 */
export function needsConsent(
  candidate: Candidate,
  terms: TermsRequirement,
): boolean {
  if (!terms.requiredVersion) return false;
  return (
    !candidate.consentVersion ||
    compareVersions(candidate.consentVersion, terms.requiredVersion) < 0
  );
}

export function toCandidateView(
  candidate: Candidate,
  terms: TermsRequirement,
): CandidateView {
  return {
    id: candidate.id,
    email: candidate.email,
    name: candidate.name,
    phone: candidate.phone,
    ...(candidate.linkedinUrl ? { linkedinUrl: candidate.linkedinUrl } : {}),
    ...(candidate.resume
      ? {
          resume: {
            fileName: candidate.resume.fileName,
            size: candidate.resume.size,
            uploadedAt: candidate.resume.uploadedAt,
          },
        }
      : {}),
    consentAt: candidate.consentAt,
    consentVersion: candidate.consentVersion,
    termsVersion: terms.publishedVersion ?? '',
    needsConsent: needsConsent(candidate, terms),
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}
