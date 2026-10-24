import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CurriculumService } from '../curriculum/curriculum.service';
import { StorageService } from '../uploads/storage.service';
import { UserRepository } from '../users/user.repository';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { Level } from '../types/student.level';
import {
  MuxAssetState,
  MuxGateway,
  STREAMING_UNAVAILABLE_MESSAGE,
} from './mux.gateway';
import { VideoLessonRepository } from './video-lesson.repository';
import {
  MATERIAL_EXTENSION_BY_MIME,
  MATERIAL_STATUS,
  MAX_MATERIALS_PER_LESSON,
  MAX_MATERIAL_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_EXTENSION_BY_MIME,
  VIDEO_LESSON_STATUS,
  VideoLesson,
  VideoLessonMaterial,
  VideoLessonStatus,
  lessonStoragePrefix,
} from './video-lesson.model';
import {
  CreateMaterialDto,
  CreateVideoLessonDto,
  ReorderVideoLessonsDto,
  UpdateVideoLessonDto,
} from './dto/video-lesson.dto';

/**
 * Validade da URL que o Mux usa para puxar o original do Storage. Folgada de
 * propósito: a ingestão de um vídeo grande pode entrar em fila.
 */
const INGEST_URL_TTL_MS = 24 * 60 * 60 * 1000;

/** Material como o painel e o aluno o veem: sem o caminho no Storage. */
export interface MaterialView {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  status: string;
}

/** O que o painel da professora recebe de uma aula. */
export interface VideoLessonView {
  id: string;
  level: Level;
  topicId: string;
  title: string;
  description: string;
  order: number;
  status: VideoLessonStatus;
  durationSec?: number;
  aspectRatio?: string;
  errorMessage?: string;
  source: { fileName: string; size: number };
  materials: MaterialView[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Vídeo aulas (spec 027): o original vai do navegador direto ao Storage, o Mux
 * o ingere de lá e o aluno assiste com reprodução assinada.
 */
@Injectable()
export class VideoLessonService {
  private readonly logger = new Logger(VideoLessonService.name);

  constructor(
    private readonly repository: VideoLessonRepository,
    private readonly curriculum: CurriculumService,
    private readonly storage: StorageService,
    private readonly mux: MuxGateway,
    private readonly users: UserRepository,
  ) {}

  /**
   * Cria a aula em `uploading` e devolve a URL de upload direto. O Mux é
   * conferido **antes** de qualquer gravação: sem ele, a professora subiria um
   * vídeo de 1 GB para ver o erro só no fim.
   */
  async create(
    dto: CreateVideoLessonDto,
    user: AuthenticatedUser,
    origin?: string,
  ): Promise<{ lesson: VideoLessonView; uploadUrl: string }> {
    if (!this.mux.isAvailable()) {
      throw new ServiceUnavailableException(STREAMING_UNAVAILABLE_MESSAGE);
    }
    const extension = VIDEO_EXTENSION_BY_MIME[dto.mimeType];
    if (!extension) {
      throw new BadRequestException(
        'Formato de vídeo não aceito. Use MP4, MOV, WEBM, MKV ou AVI.',
      );
    }
    if (dto.size > MAX_VIDEO_BYTES) {
      throw new BadRequestException('O vídeo passa do limite de 5 GB.');
    }
    await this.assertTopic(dto.level, dto.topicId);

    const siblings = await this.repository.findByTopic(dto.topicId);
    const id = this.repository.newId();
    const now = new Date().toISOString();
    const lesson: VideoLesson = {
      id,
      level: dto.level,
      topicId: dto.topicId,
      title: dto.title.trim(),
      description: dto.description?.trim() ?? '',
      order: nextOrder(siblings),
      status: VIDEO_LESSON_STATUS.UPLOADING,
      source: {
        storagePath: `${lessonStoragePrefix(id)}source.${extension}`,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        size: dto.size,
      },
      materials: [],
      createdBy: user.sub,
      createdAt: now,
      updatedAt: now,
    };

    const uploadUrl = await this.storage.createUploadSession(
      lesson.source.storagePath,
      dto.mimeType,
      origin,
    );
    await this.repository.save(lesson);
    return { lesson: toView(lesson), uploadUrl };
  }

  /**
   * O navegador terminou o PUT: confere o que **chegou** ao bucket e manda o
   * Mux ingerir. Idempotente — repetir depois de `processing` não cria um
   * segundo asset.
   */
  async completeUpload(id: string): Promise<VideoLessonView> {
    const lesson = await this.getOrThrow(id);
    if (lesson.status !== VIDEO_LESSON_STATUS.UPLOADING) return toView(lesson);

    const info = await this.storage.getObjectInfo(lesson.source.storagePath);
    if (!info) {
      throw new ConflictException(
        'O arquivo ainda não chegou ao armazenamento. Envie o vídeo de novo.',
      );
    }
    if (info.size > MAX_VIDEO_BYTES) {
      await this.storage.remove(lesson.source.storagePath);
      throw new BadRequestException('O vídeo passa do limite de 5 GB.');
    }

    const inputUrl = await this.storage.signedReadUrl(
      lesson.source.storagePath,
      INGEST_URL_TTL_MS,
    );
    const assetId = await this.mux.createAsset(inputUrl, lesson.id);

    const updated: VideoLesson = {
      ...lesson,
      status: VIDEO_LESSON_STATUS.PROCESSING,
      source: { ...lesson.source, size: info.size },
      mux: { assetId },
      updatedAt: new Date().toISOString(),
    };
    await this.repository.save(updated);
    return toView(updated);
  }

  /**
   * Consulta o Mux direto. Cobre webhook perdido e o teste local, onde o Mux
   * não alcança a API — o painel chama enquanto houver vídeo em `processing`.
   */
  async sync(id: string): Promise<VideoLessonView> {
    const lesson = await this.getOrThrow(id);
    if (lesson.status !== VIDEO_LESSON_STATUS.PROCESSING || !lesson.mux) {
      return toView(lesson);
    }
    const state = await this.mux.getAsset(lesson.mux.assetId);
    return toView(await this.applyAssetState(lesson, state));
  }

  /** Evento já verificado pelo controller do webhook. */
  async handleMuxEvent(state: MuxAssetState): Promise<void> {
    const lesson =
      (state.passthrough
        ? await this.repository.findById(state.passthrough)
        : null) ?? (await this.repository.findByAssetId(state.assetId));
    // Asset de outra origem (outro ambiente no mesmo Mux, aula já apagada):
    // não há o que atualizar, e responder erro só faria o Mux reenviar.
    if (!lesson || lesson.mux?.assetId !== state.assetId) {
      this.logger.warn(`Webhook do Mux sem aula: asset ${state.assetId}`);
      return;
    }
    await this.applyAssetState(lesson, state);
  }

  async update(
    id: string,
    dto: UpdateVideoLessonDto,
  ): Promise<VideoLessonView> {
    const lesson = await this.getOrThrow(id);
    const updated: VideoLesson = { ...lesson };

    if (dto.title !== undefined) updated.title = dto.title.trim();
    if (dto.description !== undefined) {
      updated.description = dto.description.trim();
    }
    if (dto.topicId !== undefined && dto.topicId !== lesson.topicId) {
      await this.assertTopic(lesson.level, dto.topicId);
      updated.topicId = dto.topicId;
      updated.order = nextOrder(await this.repository.findByTopic(dto.topicId));
    }

    updated.updatedAt = new Date().toISOString();
    await this.repository.save(updated);
    return toView(updated);
  }

  /** Reordena um tópico inteiro: os ids chegam na sequência desejada. */
  async reorder(topicId: string, dto: ReorderVideoLessonsDto): Promise<void> {
    const lessons = await this.repository.findByTopic(topicId);
    const current = new Set(lessons.map((l) => l.id));
    const sameSet =
      dto.ids.length === current.size &&
      new Set(dto.ids).size === dto.ids.length &&
      dto.ids.every((id) => current.has(id));
    if (!sameSet) {
      throw new BadRequestException(
        'A nova ordem precisa conter exatamente os vídeos do tópico.',
      );
    }
    await this.repository.saveOrders(
      dto.ids.map((id, order) => ({ id, order })),
      new Date().toISOString(),
    );
  }

  /** Apaga a aula, o asset no Mux e tudo dela no Storage (best-effort). */
  async remove(id: string): Promise<void> {
    const lesson = await this.getOrThrow(id);
    if (lesson.mux?.assetId) await this.mux.deleteAsset(lesson.mux.assetId);
    await this.storage.removePrefix(lessonStoragePrefix(lesson.id));
    await this.repository.delete(lesson.id);
  }

  /**
   * Reserva o material e devolve a URL de upload direto — o mesmo caminho do
   * vídeo, em duas etapas. Até a confirmação ele fica `uploading` e o aluno
   * não o vê.
   *
   * O teto de quantidade conta também os `uploading`: um upload abandonado
   * ocupa a vaga até a professora apagá-lo, e o painel mostra qual é.
   */
  async addMaterial(
    id: string,
    dto: CreateMaterialDto,
    origin?: string,
  ): Promise<{ material: MaterialView; uploadUrl: string }> {
    const lesson = await this.getOrThrow(id);
    const extension = MATERIAL_EXTENSION_BY_MIME[dto.mimeType];
    if (!extension) {
      throw new BadRequestException(
        'Tipo de arquivo não aceito. Use PDF, Word, PowerPoint, Excel, MP3, M4A, JPG, PNG ou ZIP.',
      );
    }
    if (dto.size > MAX_MATERIAL_BYTES) {
      throw new BadRequestException('O material passa do limite de 50 MB.');
    }
    if (lesson.materials.length >= MAX_MATERIALS_PER_LESSON) {
      throw new BadRequestException(
        `Cada vídeo aceita até ${MAX_MATERIALS_PER_LESSON} materiais.`,
      );
    }

    const materialId = randomUUID();
    const material: VideoLessonMaterial = {
      id: materialId,
      fileName: dto.fileName,
      storagePath: `${lessonStoragePrefix(lesson.id)}materials/${materialId}.${extension}`,
      mimeType: dto.mimeType,
      size: dto.size,
      status: MATERIAL_STATUS.UPLOADING,
      uploadedAt: new Date().toISOString(),
    };
    const uploadUrl = await this.storage.createUploadSession(
      material.storagePath,
      dto.mimeType,
      origin,
    );
    await this.repository.save({
      ...lesson,
      materials: [...lesson.materials, material],
      updatedAt: new Date().toISOString(),
    });
    return { material: toMaterialView(material), uploadUrl };
  }

  /** Confere o que chegou ao bucket e libera o material para o aluno. */
  async completeMaterial(
    id: string,
    materialId: string,
  ): Promise<MaterialView> {
    const lesson = await this.getOrThrow(id);
    const material = this.findMaterial(lesson, materialId);
    if (material.status === MATERIAL_STATUS.READY) {
      return toMaterialView(material);
    }

    const info = await this.storage.getObjectInfo(material.storagePath);
    if (!info) {
      throw new ConflictException(
        'O arquivo ainda não chegou ao armazenamento. Envie de novo.',
      );
    }
    if (info.size > MAX_MATERIAL_BYTES) {
      await this.storage.remove(material.storagePath);
      await this.repository.save({
        ...lesson,
        materials: lesson.materials.filter((m) => m.id !== materialId),
        updatedAt: new Date().toISOString(),
      });
      throw new BadRequestException('O material passa do limite de 50 MB.');
    }

    const ready: VideoLessonMaterial = {
      ...material,
      size: info.size,
      status: MATERIAL_STATUS.READY,
      uploadedAt: new Date().toISOString(),
    };
    await this.repository.save({
      ...lesson,
      materials: lesson.materials.map((m) => (m.id === materialId ? ready : m)),
      updatedAt: new Date().toISOString(),
    });
    return toMaterialView(ready);
  }

  async removeMaterial(id: string, materialId: string): Promise<void> {
    const lesson = await this.getOrThrow(id);
    const material = this.findMaterial(lesson, materialId);
    await this.storage.remove(material.storagePath);
    await this.repository.save({
      ...lesson,
      materials: lesson.materials.filter((m) => m.id !== materialId),
      updatedAt: new Date().toISOString(),
    });
  }

  private findMaterial(
    lesson: VideoLesson,
    materialId: string,
  ): VideoLessonMaterial {
    const material = lesson.materials.find((m) => m.id === materialId);
    if (!material) throw new NotFoundException('Material não encontrado.');
    return material;
  }

  /**
   * Leva o estado do Mux para a aula. Idempotente: o webhook pode chegar
   * depois do `sync` (ou duas vezes) sem regravar nada.
   */
  private async applyAssetState(
    lesson: VideoLesson,
    state: MuxAssetState,
  ): Promise<VideoLesson> {
    if (state.status === 'preparing') return lesson;
    if (lesson.status !== VIDEO_LESSON_STATUS.PROCESSING) return lesson;

    const updated: VideoLesson =
      state.status === 'ready'
        ? {
            ...lesson,
            status: VIDEO_LESSON_STATUS.READY,
            mux: {
              assetId: state.assetId,
              ...(state.playbackId ? { playbackId: state.playbackId } : {}),
              ...(state.durationSec !== undefined
                ? { durationSec: state.durationSec }
                : {}),
              ...(state.aspectRatio ? { aspectRatio: state.aspectRatio } : {}),
            },
          }
        : {
            ...lesson,
            status: VIDEO_LESSON_STATUS.ERRORED,
            errorMessage: state.error,
          };
    updated.updatedAt = new Date().toISOString();
    await this.repository.save(updated);
    return updated;
  }

  private async assertTopic(level: Level, topicId: string): Promise<void> {
    const curriculum = await this.curriculum.getLevel(level);
    const exists = curriculum.modules.some((m) =>
      m.topics.some((t) => t.id === topicId),
    );
    if (!exists) {
      throw new BadRequestException('Tópico não encontrado neste nível.');
    }
  }

  private async getOrThrow(id: string): Promise<VideoLesson> {
    const lesson = await this.repository.findById(id);
    if (!lesson) throw new NotFoundException('Vídeo aula não encontrada.');
    return lesson;
  }
}

function toMaterialView(material: VideoLessonMaterial): MaterialView {
  return {
    id: material.id,
    fileName: material.fileName,
    mimeType: material.mimeType,
    size: material.size,
    status: material.status,
  };
}

function nextOrder(siblings: VideoLesson[]): number {
  return siblings.reduce((max, l) => Math.max(max, l.order + 1), 0);
}

/** Projeção para o painel: sem caminhos do Storage nem ids do Mux. */
export function toView(lesson: VideoLesson): VideoLessonView {
  return {
    id: lesson.id,
    level: lesson.level,
    topicId: lesson.topicId,
    title: lesson.title,
    description: lesson.description,
    order: lesson.order,
    status: lesson.status,
    ...(lesson.mux?.durationSec !== undefined
      ? { durationSec: lesson.mux.durationSec }
      : {}),
    ...(lesson.mux?.aspectRatio ? { aspectRatio: lesson.mux.aspectRatio } : {}),
    ...(lesson.errorMessage ? { errorMessage: lesson.errorMessage } : {}),
    source: { fileName: lesson.source.fileName, size: lesson.source.size },
    materials: lesson.materials.map(toMaterialView),
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  };
}
