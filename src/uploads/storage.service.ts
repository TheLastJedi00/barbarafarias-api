import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { randomUUID } from 'node:crypto';
import { initializeFirebase } from '../firestore/firebase-init';

export type UploadFolder = 'avatars' | 'articles';

/** Extensões aceitas, mapeadas a partir do mime type já validado no controller. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

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
