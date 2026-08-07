import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Level } from '../types/student.level';
import { CurriculumRepository } from './curriculum.repository';
import {
  CurriculumModule,
  LevelCurriculum,
  PrincipalPrompt,
} from './curriculum.model';
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
      })),
    }));

    const data: LevelCurriculum = { level, prompt: dto.prompt, modules };
    await this.repository.upsertLevel(data);
    return data;
  }

  /** Planta baixa: módulos e tópicos ordenados, sem campos de controle. */
  async getBlueprint(level: Level): Promise<Blueprint> {
    const curriculum = await this.getLevel(level);
    return {
      level,
      modules: this.normalize(curriculum.modules).map((m) => ({
        id: m.id,
        title: m.title,
        context: m.context,
        topics: [...m.topics]
          .sort((a, b) => a.order - b.order)
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
