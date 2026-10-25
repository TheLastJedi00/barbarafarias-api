import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { CandidateRepository } from '../recruitment/candidate.repository';
import { ROLES } from '../types/role';
import { LegalRepository } from './legal.repository';
import { compareVersions, isUpToDate } from './legal-version';
import {
  LegalDocument,
  LegalDocumentType,
  LegalVersion,
  acceptanceId,
  isLegalDocumentType,
  requiredTypesFor,
} from './legal.model';

/** Documento que a pessoa precisa aceitar (o modal do front lê isto). */
export interface PendingDocument {
  type: LegalDocumentType;
  title: string;
  /** Versão vigente — é ela que o aceite grava. */
  version: string;
  requiredVersion: string;
}

/** De onde veio o aceite: a prova guarda IP e navegador. */
export interface AcceptanceMeta {
  ip: string;
  userAgent: string;
}

/** O que a leitura pública devolve: sem quem publicou (uid da gerente). */
export type PublicLegalVersion = Omit<LegalVersion, 'publishedBy'>;

/** Linha do histórico: a versão pública sem o texto. */
export type LegalVersionSummary = Omit<PublicLegalVersion, 'markdown'>;

/**
 * Documentos jurídicos (spec 029): leitura pública, painel da gerente e o
 * aceite dos usuários. A leitura pública só enxerga versão publicada.
 */
@Injectable()
export class LegalService {
  constructor(
    private readonly repository: LegalRepository,
    private readonly candidates: CandidateRepository,
  ) {}

  async getCurrent(type: string): Promise<PublicLegalVersion> {
    const header = await this.getPublishedHeader(type);
    return this.getVersion(header.type, header.publishedVersion!);
  }

  async listVersions(type: string): Promise<LegalVersionSummary[]> {
    const versions = await this.repository.listVersions(assertType(type));
    return versions
      .sort((a, b) => compareVersions(b.version, a.version))
      .map(toSummary);
  }

  async getVersion(type: string, version: string): Promise<PublicLegalVersion> {
    const found = await this.repository.getVersion(assertType(type), version);
    if (!found) throw new NotFoundException('Versão não encontrada');
    return toPublic(found);
  }

  /**
   * O que a pessoa ainda precisa aceitar (context §3). Em dia quem aceitou uma
   * versão ≥ a exigida; documento sem publicação não pendura ninguém.
   */
  async pending(user: AuthenticatedUser): Promise<PendingDocument[]> {
    const [headers, acceptances] = await Promise.all([
      Promise.all(
        requiredTypesFor(user.role).map((type) =>
          this.repository.getDocument(type),
        ),
      ),
      this.repository.findAcceptancesByUser(user.sub),
    ]);

    return headers.flatMap((header) => {
      if (!header?.publishedVersion || !header.requiredVersion) return [];
      const accepted = acceptances
        .filter((a) => a.type === header.type)
        .map((a) => a.version);
      if (isUpToDate(accepted, header.requiredVersion)) return [];
      return [
        {
          type: header.type,
          title: header.title,
          version: header.publishedVersion,
          requiredVersion: header.requiredVersion,
        },
      ];
    });
  }

  /**
   * Grava o aceite da **versão vigente**, conferida aqui: o cliente diz só o
   * tipo, nunca a versão. Aceitar de novo a mesma versão cai no mesmo doc.
   * Devolve o que ainda falta.
   */
  async accept(
    user: AuthenticatedUser,
    rawTypes: string[],
    meta: AcceptanceMeta,
  ): Promise<PendingDocument[]> {
    const allowed = requiredTypesFor(user.role);
    const types = [...new Set(rawTypes)].map((raw) => {
      const type = assertType(raw);
      if (!allowed.includes(type)) {
        throw new BadRequestException(
          'Este documento não se aplica à sua conta.',
        );
      }
      return type;
    });

    const headers = await Promise.all(
      types.map((type) => this.repository.getDocument(type)),
    );
    const acceptedAt = new Date().toISOString();
    for (const [index, header] of headers.entries()) {
      if (!header?.publishedVersion) {
        throw new BadRequestException('Documento ainda não publicado.');
      }
      const type = types[index];
      await this.repository.saveAcceptance({
        id: acceptanceId(user.sub, type, header.publishedVersion),
        userId: user.sub,
        role: user.role,
        type,
        version: header.publishedVersion,
        acceptedAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      if (type === 'recruitment' && user.role === ROLES.CANDIDATE) {
        await this.mirrorCandidateConsent(
          user.sub,
          header.publishedVersion,
          acceptedAt,
        );
      }
    }
    return this.pending(user);
  }

  /** Versão vigente e exigida de um documento (o recrutamento lê isto). */
  async requirement(type: LegalDocumentType): Promise<{
    publishedVersion: string | null;
    requiredVersion: string | null;
  }> {
    const header = await this.repository.getDocument(type);
    return {
      publishedVersion: header?.publishedVersion ?? null,
      requiredVersion: header?.requiredVersion ?? null,
    };
  }

  /**
   * A regra de candidatura da spec 028 lê `candidates.consentVersion`: o aceite
   * do termo do recrutamento é gravado lá também, junto com a prova.
   */
  private async mirrorCandidateConsent(
    candidateId: string,
    version: string,
    acceptedAt: string,
  ): Promise<void> {
    const candidate = await this.candidates.findById(candidateId);
    if (!candidate) return;
    await this.candidates.save({
      ...candidate,
      consentAt: acceptedAt,
      consentVersion: version,
      updatedAt: acceptedAt,
    });
  }

  private async getPublishedHeader(type: string): Promise<LegalDocument> {
    const header = await this.repository.getDocument(assertType(type));
    if (!header?.publishedVersion) {
      throw new NotFoundException('Documento ainda não publicado');
    }
    return header;
  }
}

function toPublic(version: LegalVersion): PublicLegalVersion {
  const result: Partial<LegalVersion> = { ...version };
  delete result.publishedBy;
  return result as PublicLegalVersion;
}

function toSummary(version: LegalVersion): LegalVersionSummary {
  const summary: Partial<LegalVersion> = toPublic(version);
  delete summary.markdown;
  return summary as LegalVersionSummary;
}

/** Tipo fora da lista é 404, antes de qualquer leitura. */
export function assertType(type: string): LegalDocumentType {
  if (!isLegalDocumentType(type)) {
    throw new NotFoundException('Documento não encontrado');
  }
  return type;
}
