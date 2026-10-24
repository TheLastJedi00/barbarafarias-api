import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Level } from '../types/student.level';
import { CurriculumRepository } from './curriculum.repository';
import {
  CurriculumModule,
  CurriculumTopic,
  LevelCurriculum,
  PrincipalPrompt,
} from './curriculum.model';
import { CreateVideoTopicDto } from './dto/create-video-topic.dto';
import { UpsertLevelDto } from './dto/upsert-level.dto';
import { UpsertPrincipalDto } from './dto/upsert-principal.dto';

/** Projeção enxuta e ordenada que o fluxo de geração paralela consome. */
export interface Blueprint {
  level: Level;
  modules: {
    id: string;
    title: string;
    context: string;
    topics: { id: string; title: string }[];
  }[];
}

@Injectable()
export class CurriculumService {
  constructor(private readonly repository: CurriculumRepository) {}

  async getPrincipal(): Promise<PrincipalPrompt> {
    return (await this.repository.getPrincipal()) ?? { prompt: '' };
  }

  async upsertPrincipal(dto: UpsertPrincipalDto): Promise<PrincipalPrompt> {
    const data: PrincipalPrompt = { prompt: dto.prompt };
    await this.repository.upsertPrincipal(data);
    return data;
  }

  async getLevel(level: Level): Promise<LevelCurriculum> {
    const stored = await this.repository.getLevel(level);
    if (!stored) {
      return { level, prompt: '', modules: [] };
    }
    // normaliza a ordem pela posição no array (fonte única de verdade)
    return { ...stored, modules: this.normalize(stored.modules) };
  }

  async upsertLevel(
    level: Level,
    dto: UpsertLevelDto,
  ): Promise<LevelCurriculum> {
    const modules: CurriculumModule[] = dto.modules.map((m, mi) => ({
      id: m.id ?? randomUUID(),
      title: m.title,
      context: m.context,
      order: mi,
      topics: m.topics.map((t, ti) => ({
        id: t.id ?? randomUUID(),
        title: t.title,
        order: ti,
        // Só grava a flag quando ligada: o Firestore recusa `undefined` e o
        // tópico comum continua com a forma de antes da spec 027.
        ...(t.videoOnly ? { videoOnly: true } : {}),
      })),
    }));

    await this.assertNoVideoOrphaned(level, modules);

    const data: LevelCurriculum = { level, prompt: dto.prompt, modules };
    await this.repository.upsertLevel(data);
    return data;
  }

  /**
   * Acrescenta um tópico só de vídeo ao fim do módulo (spec 027), sem que o
   * painel de vídeo aulas precise reenviar a árvore inteira do nível.
   */
  async createVideoTopic(
    level: Level,
    moduleId: string,
    dto: CreateVideoTopicDto,
  ): Promise<CurriculumTopic> {
    const curriculum = await this.getLevel(level);
    const module = curriculum.modules.find((m) => m.id === moduleId);
    if (!module) {
      throw new NotFoundException('Módulo não encontrado neste nível.');
    }

    const topic: CurriculumTopic = {
      id: randomUUID(),
      title: dto.title.trim(),
      order: module.topics.length,
      videoOnly: true,
    };
    module.topics.push(topic);
    await this.repository.upsertLevel(curriculum);
    return topic;
  }

  /**
   * O vídeo aponta para o **id** do tópico. Renomear ou reordenar não o afeta;
   * remover o tópico (ou o módulo que o contém) deixaria o vídeo sem lugar na
   * árvore do aluno — então a gravação é recusada e a professora move ou apaga
   * os vídeos antes (spec 027).
   */
  private async assertNoVideoOrphaned(
    level: Level,
    modules: CurriculumModule[],
  ): Promise<void> {
    const counts = await this.repository.countVideosByTopic(level);
    if (counts.size === 0) return;

    const kept = new Set(modules.flatMap((m) => m.topics.map((t) => t.id)));
    const orphaned = [...counts.entries()].filter(([id]) => !kept.has(id));
    if (orphaned.length === 0) return;

    const videos = orphaned.reduce((sum, [, n]) => sum + n, 0);
    const topics =
      orphaned.length === 1
        ? 'um tópico que tem'
        : `${orphaned.length} tópicos que têm`;
    const count = videos === 1 ? '1 vídeo' : `${videos} vídeos`;
    throw new ConflictException(
      `Não é possível remover ${topics} vídeo aula (${count}). Mova ou apague os vídeos antes.`,
    );
  }

  /**
   * Planta baixa: módulos e tópicos ordenados, sem campos de controle. Tópicos
   * `videoOnly` ficam de fora — eles existem para as vídeo aulas, não para a
   * geração (spec 027).
   */
  async getBlueprint(level: Level): Promise<Blueprint> {
    return this.toBlueprint(await this.getLevel(level));
  }

  /**
   * Projeção pura de um nível já carregado. Existe separada do `getBlueprint`
   * para que a geração, que precisa do prompt do nível E da planta baixa, não
   * leia o mesmo documento do Firestore duas vezes.
   */
  toBlueprint(curriculum: LevelCurriculum): Blueprint {
    return {
      level: curriculum.level,
      modules: this.normalize(curriculum.modules).map((m) => ({
        id: m.id,
        title: m.title,
        context: m.context,
        topics: [...m.topics]
          .sort((a, b) => a.order - b.order)
          .filter((t) => !t.videoOnly)
          .map((t) => ({ id: t.id, title: t.title })),
      })),
    };
  }

  /** Reindexa `order` pela posição atual do array (módulos e tópicos). */
  private normalize(modules: CurriculumModule[]): CurriculumModule[] {
    return [...modules]
      .sort((a, b) => a.order - b.order)
      .map((m, mi) => ({
        ...m,
        order: mi,
        topics: [...m.topics]
          .sort((a, b) => a.order - b.order)
          .map((t, ti) => ({ ...t, order: ti })),
      }));
  }
}
