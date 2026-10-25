import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import {
  LegalAcceptance,
  LegalDocument,
  LegalDocumentType,
  LegalDraft,
  LegalVersion,
} from './legal.model';

export const LEGAL_DOCUMENTS_COLLECTION = 'legalDocuments';
export const LEGAL_ACCEPTANCES_COLLECTION = 'legalAcceptances';

/** Publicação: o que a transação grava de uma vez (context §6). */
export interface PublishWrite {
  header: LegalDocument;
  version: LegalVersion;
}

/**
 * Documentos jurídicos e aceites (spec 029). Versão publicada só é criada —
 * não há método de atualizar ou apagar versão, e a ausência é o desenho.
 */
@Injectable()
export class LegalRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async getDocument(type: LegalDocumentType): Promise<LegalDocument | null> {
    const doc = await this.documentRef(type).get();
    return doc.exists ? (doc.data() as LegalDocument) : null;
  }

  async getVersion(
    type: LegalDocumentType,
    version: string,
  ): Promise<LegalVersion | null> {
    const doc = await this.versionsRef(type).doc(version).get();
    return doc.exists ? (doc.data() as LegalVersion) : null;
  }

  async listVersions(type: LegalDocumentType): Promise<LegalVersion[]> {
    const snapshot = await this.versionsRef(type).get();
    return snapshot.docs.map((doc) => doc.data() as LegalVersion);
  }

  async getDraft(type: LegalDocumentType): Promise<LegalDraft | null> {
    const doc = await this.draftRef(type).get();
    return doc.exists ? (doc.data() as LegalDraft) : null;
  }

  async saveDraft(draft: LegalDraft): Promise<void> {
    await this.draftRef(draft.type).set(clean(draft));
  }

  async deleteDraft(type: LegalDocumentType): Promise<void> {
    await this.draftRef(type).delete();
  }

  /**
   * Grava a versão, o cabeçalho e apaga o rascunho numa transação. `create`
   * (e não `set`) recusa versão já existente: publicar nunca sobrescreve.
   */
  async publish(
    type: LegalDocumentType,
    build: (current: LegalDocument | null) => PublishWrite,
  ): Promise<PublishWrite> {
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(this.documentRef(type));
      const current = snapshot.exists
        ? (snapshot.data() as LegalDocument)
        : null;
      const write = build(current);
      tx.create(
        this.versionsRef(type).doc(write.version.version),
        clean(write.version),
      );
      tx.set(this.documentRef(type), clean(write.header));
      tx.delete(this.draftRef(type));
      return write;
    });
  }

  async findAcceptancesByUser(userId: string): Promise<LegalAcceptance[]> {
    const snapshot = await this.acceptances()
      .where('userId', '==', userId)
      .get();
    return snapshot.docs.map((doc) => doc.data() as LegalAcceptance);
  }

  async findAcceptancesByType(
    type: LegalDocumentType,
  ): Promise<LegalAcceptance[]> {
    const snapshot = await this.acceptances().where('type', '==', type).get();
    return snapshot.docs.map((doc) => doc.data() as LegalAcceptance);
  }

  async saveAcceptance(acceptance: LegalAcceptance): Promise<void> {
    await this.acceptances().doc(acceptance.id).set(clean(acceptance));
  }

  private documentRef(type: LegalDocumentType) {
    return this.db.collection(LEGAL_DOCUMENTS_COLLECTION).doc(type);
  }

  private versionsRef(type: LegalDocumentType) {
    return this.documentRef(type).collection('versions');
  }

  private draftRef(type: LegalDocumentType) {
    return this.documentRef(type).collection('drafts').doc('current');
  }

  private acceptances() {
    return this.db.collection(LEGAL_ACCEPTANCES_COLLECTION);
  }
}

/** O Firestore recusa `undefined`; opcional ausente simplesmente não vai. */
function clean<T extends object>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
