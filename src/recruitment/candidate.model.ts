/**
 * Versão vigente do Termo de Tratamento de Dados do recrutamento (spec 028 §4).
 * Mudou o texto de forma relevante → sobe aqui, e quem aceitou uma versão
 * anterior precisa aceitar de novo antes de se candidatar.
 */
export const RECRUITMENT_TERMS_VERSION = '1.0';

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

export function needsConsent(candidate: Candidate): boolean {
  return candidate.consentVersion !== RECRUITMENT_TERMS_VERSION;
}

export function toCandidateView(candidate: Candidate): CandidateView {
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
    termsVersion: RECRUITMENT_TERMS_VERSION,
    needsConsent: needsConsent(candidate),
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}
