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
 *
 * Desde a spec 020 a estrutura (módulos, títulos de tópicos e ids) vem do
 * currículo cadastrado pela Teacher, não da IA. À IA resta um campo só: a
 * intro de cada módulo, na ordem do currículo — daí o schema ser um array de
 * strings, e não a árvore inteira que a `SkeletonSchema` validava antes.
 */
export const ModuleIntrosSchema = z.array(z.string());

export interface SkeletonTopic {
  topic: string;
}

/** Esqueleto já com o `id` do tópico (o uuid do currículo). */
export interface SkeletonTopicWithId extends SkeletonTopic {
  id: string;
}
export interface SkeletonModuleWithId {
  title: string;
  text: string;
  topics: SkeletonTopicWithId[];
}
