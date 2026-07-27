import { z } from 'zod';

export const WordSchema = z.object({
  english: z.string(),
  portuguese: z.string(),
  pronounce: z.string(),
});
export type Word = z.infer<typeof WordSchema>;

export const MusicSchema = z.object({
  title: z.string(),
  artist: z.string(),
  youtube: z.string(),
});
export type Music = z.infer<typeof MusicSchema>;

export const TopicSchema = z.object({
  topic: z.string(),
  description: z.string(),
  examples: z.array(z.string()),
  curiosity: z.string(),
  roleplayInstruction: z.string(),
  roleplayDialog: z.array(z.string()),
  words: z.array(WordSchema),
  music: MusicSchema,
});
export type Topic = z.infer<typeof TopicSchema>;

export const ModuleSchema = z.object({
  title: z.string(),
  text: z.string(),
  topics: z.array(TopicSchema),
});
export type Module = z.infer<typeof ModuleSchema>;

export const SupplyModulesSchema = z.array(ModuleSchema);

/**
 * Esqueleto ("planta baixa") do material — usado na geração granular.
 * A IA devolve apenas os títulos: módulos e os títulos dos tópicos, sem o
 * conteúdo pesado (words/music/roleplay). O `id` de cada tópico é atribuído
 * pelo backend depois da validação (a IA não o gera) e serve para o cliente
 * chavear a UI e o retry granular.
 */
export const SkeletonTopicSchema = z.object({
  topic: z.string(),
});
export type SkeletonTopic = z.infer<typeof SkeletonTopicSchema>;

export const SkeletonModuleSchema = z.object({
  title: z.string(),
  text: z.string(),
  topics: z.array(SkeletonTopicSchema),
});
export type SkeletonModule = z.infer<typeof SkeletonModuleSchema>;

export const SkeletonSchema = z.array(SkeletonModuleSchema);

/** Esqueleto já com o `id` estável de cada tópico (`m{i}_t{j}`). */
export interface SkeletonTopicWithId extends SkeletonTopic {
  id: string;
}
export interface SkeletonModuleWithId {
  title: string;
  text: string;
  topics: SkeletonTopicWithId[];
}
