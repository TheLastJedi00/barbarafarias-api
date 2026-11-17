import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { LEVELS, Level } from '../types/student.level';
import { ROLES } from '../types/role';
import { PAYMENT_PENDING_MESSAGE } from '../guards/active-plan.guard';
import {
  ModuleAccessService,
  type ModuleAccess,
} from '../store/module-access.service';
import { STORE_READABLE_MIME } from '../store/store-content.repository';
import {
  MuxAssetState,
  MuxGateway,
  PlaybackTokens,
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

/** Validade do link de download de material. */
const DOWNLOAD_URL_TTL_MS = 15 * 60 * 1000;

/**
 * Maior trecho de PDF por pedido de leitura (spec 032). Folgado para o leitor
 * pedir poucas vezes, e bem abaixo do teto de resposta da Vercel (~4,5 MB).
 */
export const MAX_READ_CHUNK_BYTES = 1024 * 1024;

/** Quem tem o módulo pela loja lê, não baixa (spec 032 decisão 2). */
export const READ_ONLY_MESSAGE =
  'Este material está disponível só para leitura.';

/** Acesso que não é o de pagamento pendente: o que de fato libera algo. */
type GrantedAccess = Exclude<ModuleAccess, { mode: 'payment-pending' }>;

/** Árvore de um módulo só, para quem o tem (spec 032). */
export interface ModuleLessonTree {
  level: Level;
  module: VideoLessonTree<StudentLessonView>['modules'][number];
  access: { mode: 'full' | 'store'; accessUntil?: string };
}

/**
 * O que o aluno recebe de uma aula: só o que está pronto, sem nome do arquivo
 * original, status ou motivo de erro.
 */
export interface StudentLessonView {
  id: string;
  level: Level;
  topicId: string;
  title: string;
  description: string;
  order: number;
  durationSec?: number;
  aspectRatio?: string;
  thumbnailUrl?: string;
  materials: MaterialView[];
}

/** Árvore módulo › tópico › aulas, na ordem do currículo do nível. */
export interface VideoLessonTree<L> {
  level: Level | null;
  modules: {
    id: string;
    title: string;
    topics: { id: string; title: string; videoOnly: boolean; lessons: L[] }[];
  }[];
}

/** Detalhe de uma aula, com a vizinhança dentro do tópico. */
export interface VideoLessonDetail<L> {
  lesson: L;
  /**
   * `store`: quem vê entrou pela loja (spec 032) — só PDFs, só leitura. A tela
   * troca o "baixar" pelo leitor.
   */
  access: 'full' | 'store';
  module: { id: string; title: string };
  topic: { id: string; title: string };
  previousId: string | null;
  nextId: string | null;
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
    private readonly access: ModuleAccessService,
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
   * Árvore do aluno: o nível **dele**, só aulas prontas, e só os módulos e
   * tópicos que têm aula — um tópico vazio na tela do aluno é ruído.
   */
  async getStudentTree(
    user: AuthenticatedUser,
  ): Promise<VideoLessonTree<StudentLessonView>> {
    const level = await this.studentLevel(user);
    if (!level) return { level: null, modules: [] };

    const lessons = (await this.repository.findByLevel(level)).filter(isReady);
    const tree = await this.buildTree(level, lessons, (l) =>
      this.toStudentView(l, { mode: 'full' }),
    );
    return {
      level,
      modules: tree.modules
        .map((m) => ({
          ...m,
          topics: m.topics.filter((t) => t.lessons.length),
        }))
        .filter((m) => m.topics.length),
    };
  }

  /**
   * Árvore do painel: todos os módulos e tópicos do nível (é onde a professora
   * escolhe o destino do vídeo) e aulas em qualquer status.
   */
  async getTeacherTree(
    level: Level,
  ): Promise<VideoLessonTree<VideoLessonView & { thumbnailUrl?: string }>> {
    const lessons = await this.repository.findByLevel(level);
    return this.buildTree(level, lessons, async (l) => ({
      ...toView(l),
      ...(await this.thumbnail(l)),
    }));
  }

  async getDetail(
    id: string,
    user: AuthenticatedUser,
  ): Promise<VideoLessonDetail<StudentLessonView | VideoLessonView>> {
    const { lesson, access } = await this.getVisible(id, user);
    const student = user.role === ROLES.STUDENT;

    const curriculum = await this.curriculum.getLevel(lesson.level);
    const module = curriculum.modules.find((m) =>
      m.topics.some((t) => t.id === lesson.topicId),
    );
    const topic = module?.topics.find((t) => t.id === lesson.topicId);

    const siblings = (await this.repository.findByTopic(lesson.topicId))
      .filter((l) => !student || isReady(l))
      .sort(byOrder);
    const index = siblings.findIndex((l) => l.id === lesson.id);

    return {
      lesson: student
        ? await this.toStudentView(lesson, access)
        : toView(lesson),
      access: access.mode === 'store' ? 'store' : 'full',
      module: { id: module?.id ?? '', title: module?.title ?? '' },
      topic: { id: topic?.id ?? lesson.topicId, title: topic?.title ?? '' },
      previousId: index > 0 ? siblings[index - 1].id : null,
      nextId:
        index >= 0 && index < siblings.length - 1
          ? siblings[index + 1].id
          : null,
    };
  }

  /** Tokens do `<mux-player>`. Só para aula pronta que a pessoa pode ver. */
  async getPlayback(
    id: string,
    user: AuthenticatedUser,
  ): Promise<{ playbackId: string; tokens: PlaybackTokens }> {
    const { lesson } = await this.getVisible(id, user);
    const playbackId = lesson.mux?.playbackId;
    if (!isReady(lesson) || !playbackId) {
      throw new ConflictException('O vídeo ainda está em processamento.');
    }
    return { playbackId, tokens: await this.mux.signPlayback(playbackId) };
  }

  /** Link de download que expira em 15 min, com o nome original. */
  async getMaterialDownload(
    id: string,
    materialId: string,
    user: AuthenticatedUser,
  ): Promise<{ url: string }> {
    const { lesson, access } = await this.getVisible(id, user);
    if (access.mode === 'store')
      throw new ForbiddenException(READ_ONLY_MESSAGE);
    const material = this.findMaterial(lesson, materialId);
    if (material.status !== MATERIAL_STATUS.READY) {
      throw new NotFoundException('Material não encontrado.');
    }
    return {
      url: await this.storage.signedReadUrl(
        material.storagePath,
        DOWNLOAD_URL_TTL_MS,
        material.fileName,
      ),
    };
  }

  /**
   * A regra de quem vê: professora e gerente veem tudo; o aluno vê aula
   * **pronta do próprio nível**. Fora disso, 404 — e não 403, para não
   * confirmar que a aula existe.
   */
  private async getVisible(
    id: string,
    user: AuthenticatedUser,
  ): Promise<{ lesson: VideoLesson; access: GrantedAccess }> {
    const lesson = await this.getOrThrow(id);
    if (user.role !== ROLES.STUDENT) {
      return { lesson, access: { mode: 'full' } };
    }
    if (!isReady(lesson)) {
      throw new NotFoundException('Vídeo aula não encontrada.');
    }

    // O módulo sai da árvore do currículo: a aula guarda o tópico (spec 027).
    const curriculum = await this.curriculum.getLevel(lesson.level);
    const module = curriculum.modules.find((m) =>
      m.topics.some((t) => t.id === lesson.topicId),
    );
    const access = module
      ? await this.access.resolve(user, lesson.level, module.id)
      : null;
    return { lesson, access: this.granted(access) };
  }

  /**
   * Traduz o acesso em resposta. O aluno do plano em atraso recebe o 403 com a
   * mensagem que o front reconhece — o mesmo que o `ActivePlanGuard` dava
   * antes destas rotas passarem a aceitar o comprador da loja (spec 032).
   * Quem não tem acesso nenhum recebe 404, que não confirma que a aula existe.
   */
  private granted(access: ModuleAccess | null): GrantedAccess {
    if (access?.mode === 'payment-pending') {
      throw new ForbiddenException(PAYMENT_PENDING_MESSAGE);
    }
    if (!access) throw new NotFoundException('Vídeo aula não encontrada.');
    return access;
  }

  /**
   * Um módulo só, para quem o tem (spec 032): o comprador da loja, mas também
   * o assinante do nível e a equipe. Só aulas prontas, e só PDFs para quem
   * entrou pela loja.
   */
  async getModuleTree(
    level: Level,
    moduleId: string,
    user: AuthenticatedUser,
  ): Promise<ModuleLessonTree> {
    const access = this.granted(
      await this.access.resolve(user, level, moduleId),
    );
    const lessons = (await this.repository.findByLevel(level)).filter(isReady);
    const tree = await this.buildTree(level, lessons, (l) =>
      this.toStudentView(l, access),
    );
    const module = tree.modules.find((m) => m.id === moduleId);
    if (!module) throw new NotFoundException('Módulo não encontrado.');
    return {
      level,
      module: {
        ...module,
        topics: module.topics.filter((t) => t.lessons.length),
      },
      access:
        access.mode === 'store'
          ? { mode: 'store', accessUntil: access.accessUntil }
          : { mode: 'full' },
    };
  }

  /** Para o leitor de PDF: nome e tamanho, sem caminho nem URL. */
  async getMaterialReadInfo(
    id: string,
    materialId: string,
    user: AuthenticatedUser,
  ): Promise<{ fileName: string; size: number; mimeType: string }> {
    const material = await this.readableMaterial(id, materialId, user);
    return {
      fileName: material.fileName,
      size: material.size,
      mimeType: material.mimeType,
    };
  }

  /**
   * Um trecho do PDF (`start`/`end` inclusivos), servido pela API (spec 032).
   * O leitor pede só as páginas que mostra; o arquivo inteiro nunca vira um
   * link que se copia e cola.
   */
  async readMaterialRange(
    id: string,
    materialId: string,
    user: AuthenticatedUser,
    start: number,
    end: number,
  ): Promise<Buffer> {
    const material = await this.readableMaterial(id, materialId, user);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      end >= material.size ||
      end - start + 1 > MAX_READ_CHUNK_BYTES
    ) {
      throw new BadRequestException('Trecho inválido.');
    }
    const data = await this.storage.readRange(material.storagePath, start, end);
    if (!data) throw new NotFoundException('Material não encontrado.');
    return data;
  }

  /** Só PDF pronto, e só para quem vê a aula. */
  private async readableMaterial(
    id: string,
    materialId: string,
    user: AuthenticatedUser,
  ): Promise<VideoLessonMaterial> {
    const { lesson } = await this.getVisible(id, user);
    const material = this.findMaterial(lesson, materialId);
    if (
      material.status !== MATERIAL_STATUS.READY ||
      material.mimeType !== STORE_READABLE_MIME
    ) {
      throw new NotFoundException('Material não encontrado.');
    }
    return material;
  }

  private async studentLevel(user: AuthenticatedUser): Promise<Level | null> {
    const student = await this.users.findById(user.sub);
    const level = student?.level;
    return level && (LEVELS as readonly string[]).includes(level)
      ? (level as Level)
      : null;
  }

  private async buildTree<L>(
    level: Level,
    lessons: VideoLesson[],
    project: (lesson: VideoLesson) => Promise<L>,
  ): Promise<VideoLessonTree<L>> {
    const curriculum = await this.curriculum.getLevel(level);
    const byTopic = new Map<string, VideoLesson[]>();
    for (const lesson of [...lessons].sort(byOrder)) {
      byTopic.set(lesson.topicId, [
        ...(byTopic.get(lesson.topicId) ?? []),
        lesson,
      ]);
    }

    const modules = await Promise.all(
      curriculum.modules.map(async (m) => ({
        id: m.id,
        title: m.title,
        topics: await Promise.all(
          m.topics.map(async (t) => ({
            id: t.id,
            title: t.title,
            videoOnly: t.videoOnly === true,
            lessons: await Promise.all((byTopic.get(t.id) ?? []).map(project)),
          })),
        ),
      })),
    );
    return { level, modules };
  }

  /**
   * A visão do aluno. Quem entrou pela loja vê **só os PDFs** de apoio: os
   * outros tipos não abrem no navegador, e baixar não é o que ele comprou
   * (spec 032 decisão 10).
   */
  private async toStudentView(
    lesson: VideoLesson,
    access: GrantedAccess,
  ): Promise<StudentLessonView> {
    return {
      id: lesson.id,
      level: lesson.level,
      topicId: lesson.topicId,
      title: lesson.title,
      description: lesson.description,
      order: lesson.order,
      ...(lesson.mux?.durationSec !== undefined
        ? { durationSec: lesson.mux.durationSec }
        : {}),
      ...(lesson.mux?.aspectRatio
        ? { aspectRatio: lesson.mux.aspectRatio }
        : {}),
      ...(await this.thumbnail(lesson)),
      materials: lesson.materials
        .filter((m) => m.status === MATERIAL_STATUS.READY)
        .filter(
          (m) => access.mode !== 'store' || m.mimeType === STORE_READABLE_MIME,
        )
        .map(toMaterialView),
    };
  }

  private async thumbnail(
    lesson: VideoLesson,
  ): Promise<{ thumbnailUrl?: string }> {
    const playbackId = lesson.mux?.playbackId;
    if (!isReady(lesson) || !playbackId) return {};
    const url = await this.mux.thumbnailUrl(playbackId);
    return url ? { thumbnailUrl: url } : {};
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

function isReady(lesson: VideoLesson): boolean {
  return lesson.status === VIDEO_LESSON_STATUS.READY;
}

function byOrder(a: VideoLesson, b: VideoLesson): number {
  return a.order - b.order || a.createdAt.localeCompare(b.createdAt);
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
