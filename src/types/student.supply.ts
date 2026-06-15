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
