import { Level } from '../types/student.level';

/**
 * Ciclo de vida da vídeo aula (spec 027):
 *
 * `uploading` → o doc existe e o navegador está enviando o original ao Storage
 * `processing` → o original chegou e o Mux está ingerindo a partir dele
 * `ready` → o Mux terminou; só aqui o aluno enxerga a aula
 * `errored` → o Mux recusou o arquivo (formato, arquivo corrompido)
 */
export const VIDEO_LESSON_STATUS = {
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  READY: 'ready',
  ERRORED: 'errored',
} as const;

export type VideoLessonStatus =
  (typeof VIDEO_LESSON_STATUS)[keyof typeof VIDEO_LESSON_STATUS];

/** Material de apoio: mesmo upload direto, mesmo ciclo em duas etapas. */
export const MATERIAL_STATUS = {
  UPLOADING: 'uploading',
  READY: 'ready',
} as const;

export type MaterialStatus =
  (typeof MATERIAL_STATUS)[keyof typeof MATERIAL_STATUS];

export interface VideoLessonMaterial {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  size: number;
  status: MaterialStatus;
  uploadedAt: string; // ISO
}

export interface VideoLessonSource {
  storagePath: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface VideoLessonMux {
  assetId: string;
  playbackId?: string;
  durationSec?: number;
  aspectRatio?: string;
}

/**
 * Uma vídeo aula, presa a um **tópico** do currículo do nível.
 *
 * Guarda o `topicId` e não o `moduleId`: o módulo é derivado da árvore do
 * currículo na leitura. Assim, mover um tópico de módulo no Prompt Manager
 * leva os vídeos junto, em vez de deixá-los apontando para o módulo antigo.
 */
export interface VideoLesson {
  id: string;
  level: Level;
  topicId: string;
  title: string;
  description: string;
  /** Posição dentro do tópico. */
  order: number;
  status: VideoLessonStatus;
  source: VideoLessonSource;
  mux?: VideoLessonMux;
  /** Motivo do `errored`, como o Mux o descreveu. */
  errorMessage?: string;
  materials: VideoLessonMaterial[];
  createdBy: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/** Tetos de upload (spec 027 §5). */
export const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
export const MAX_MATERIAL_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_MATERIALS_PER_LESSON = 10;

/** Extensão gravada no Storage, a partir do mime type já validado. */
export const VIDEO_EXTENSION_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/x-msvideo': 'avi',
};

export const MATERIAL_EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
};

/** Prefixo de tudo o que pertence a uma aula no Storage. */
export function lessonStoragePrefix(lessonId: string): string {
  return `video-lessons/${lessonId}/`;
}
