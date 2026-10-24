import { Injectable, NotFoundException } from '@nestjs/common';
import { LegalRepository } from './legal.repository';
import { compareVersions } from './legal-version';
import {
  LegalDocument,
  LegalDocumentType,
  LegalVersion,
  isLegalDocumentType,
} from './legal.model';

/** Linha do histórico: a versão sem o texto. */
export type LegalVersionSummary = Omit<LegalVersion, 'markdown'>;

/**
 * Documentos jurídicos (spec 029): leitura pública, painel da gerente e o
 * aceite dos usuários. A leitura pública só enxerga versão publicada.
 */
@Injectable()
export class LegalService {
  constructor(private readonly repository: LegalRepository) {}

  async getCurrent(type: string): Promise<LegalVersion> {
    const header = await this.getPublishedHeader(type);
    return this.getVersion(header.type, header.publishedVersion!);
  }

  async listVersions(type: string): Promise<LegalVersionSummary[]> {
    const versions = await this.repository.listVersions(assertType(type));
    return versions
      .sort((a, b) => compareVersions(b.version, a.version))
      .map(toSummary);
  }

  async getVersion(type: string, version: string): Promise<LegalVersion> {
    const found = await this.repository.getVersion(assertType(type), version);
    if (!found) throw new NotFoundException('Versão não encontrada');
    return found;
  }

  private async getPublishedHeader(type: string): Promise<LegalDocument> {
    const header = await this.repository.getDocument(assertType(type));
    if (!header?.publishedVersion) {
      throw new NotFoundException('Documento ainda não publicado');
    }
    return header;
  }
}

function toSummary(version: LegalVersion): LegalVersionSummary {
  const summary: Partial<LegalVersion> = { ...version };
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
