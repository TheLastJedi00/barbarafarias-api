import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { randomUUID } from 'node:crypto';
import { initializeFirebase } from '../firestore/firebase-init';

/** `artworks`: fotos e prévias da Campanha (spec 031), só da gerente. */
export type UploadFolder = 'avatars' | 'articles' | 'artworks';

/** Extensões aceitas, mapeadas a partir do mime type já validado no controller. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * `Content-Disposition` de download com o nome original. O `filename` ASCII
 * é o fallback; o `filename*` (RFC 5987) leva acentos e espaços intactos.
 */
export function attachmentDisposition(fileName: string): string {
  const ascii = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Upload de mídia para o **Firebase Storage** (spec 011 §3).
 *
 * O binário passa pela API em vez de ir direto do navegador porque este
 * projeto **não publica regras do Firebase** — o cliente nunca fala com o
 * Firebase, só com esta API, que usa o Admin SDK. Manter esse desenho evita
 * abrir um segundo canal de escrita com regras próprias para revisar.
 *
 * O Firestore guarda apenas a URL devolvida aqui.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  async upload(
    file: { buffer: Buffer; mimetype: string },
    folder: UploadFolder,
  ): Promise<{ url: string; path: string }> {
    const bucket = this.bucket();
    const extension = EXTENSION_BY_MIME[file.mimetype] ?? 'jpg';
    const path = `${folder}/${randomUUID()}.${extension}`;

    // Token de download: torna a URL pública sem abrir o bucket inteiro.
    const downloadToken = randomUUID();
    const object = bucket.file(path);

    await object.save(file.buffer, {
      contentType: file.mimetype,
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });

    return { url: this.publicUrl(bucket.name, path, downloadToken), path };
  }

  /**
   * Sessão de upload **resumable** do GCS (spec 027): o navegador envia o
   * arquivo direto para a URL devolvida, sem passar pela API.
   *
   * Vídeo e material de apoio não cabem no desenho do `upload()` acima — a
   * Vercel corta o corpo em ~4,5 MB e o `main.ts` em 1 MB. A API continua
   * sendo quem autoriza: a URL vale para **um objeto**, com caminho e
   * content-type decididos aqui, e é assinada pela service account. O bucket
   * segue fechado e não há regras do Firebase a publicar.
   *
   * `origin` é a origem do front que vai fazer os PUTs: o GCS devolve os
   * headers de CORS da sessão para ela.
   */
  async createUploadSession(
    path: string,
    contentType: string,
    origin?: string,
  ): Promise<string> {
    const [url] = await this.bucket()
      .file(path)
      .createResumableUpload({
        metadata: { contentType },
        ...(origin ? { origin } : {}),
      });
    return url;
  }

  /**
   * Tamanho e tipo do objeto já gravado, ou `null` se ele não existe. É a
   * conferência depois do upload direto: o que vale é o que chegou ao bucket,
   * não o que o navegador disse que ia mandar.
   */
  async getObjectInfo(
    path: string,
  ): Promise<{ size: number; contentType?: string } | null> {
    try {
      const [metadata] = await this.bucket().file(path).getMetadata();
      return {
        size: Number(metadata.size ?? 0),
        contentType: metadata.contentType,
      };
    } catch (error) {
      if ((error as { code?: number }).code === 404) return null;
      throw error;
    }
  }

  /**
   * URL v4 assinada de leitura, que expira (spec 027). Com `fileName`, o
   * navegador baixa o arquivo com o nome original em vez de abri-lo.
   */
  async signedReadUrl(
    path: string,
    ttlMs: number,
    fileName?: string,
  ): Promise<string> {
    const [url] = await this.bucket()
      .file(path)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + ttlMs,
        ...(fileName
          ? { responseDisposition: attachmentDisposition(fileName) }
          : {}),
      });
    return url;
  }

  /** Best-effort, como o `remove`: apaga tudo sob um prefixo. */
  async removePrefix(prefix: string): Promise<void> {
    try {
      await this.bucket().deleteFiles({ prefix });
    } catch (error) {
      this.logger.warn(
        `Falha ao remover ${prefix}* do Storage: ${String(error)}`,
      );
    }
  }

  /** Best-effort: trocar de avatar não pode falhar porque o antigo sumiu. */
  async remove(path: string): Promise<void> {
    try {
      await this.bucket().file(path).delete();
    } catch (error) {
      this.logger.warn(`Falha ao remover ${path} do Storage: ${String(error)}`);
    }
  }

  private bucket() {
    initializeFirebase();
    const name = process.env.FIREBASE_STORAGE_BUCKET;
    return name ? admin.storage().bucket(name) : admin.storage().bucket();
  }

  private publicUrl(bucket: string, path: string, token: string): string {
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
      path,
    )}?alt=media&token=${token}`;
  }
}
