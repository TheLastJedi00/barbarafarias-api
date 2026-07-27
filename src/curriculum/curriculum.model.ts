import { Level } from '../types/student.level';

/** Tópico: unidade mínima de geração. `prompt` é a instrução granular. */
export interface CurriculumTopic {
  id: string;
  prompt: string;
  order: number;
}

/** Módulo: agrupador ordenado de tópicos, com contexto temático próprio. */
export interface CurriculumModule {
  id: string;
  title: string;
  context: string;
  order: number;
  topics: CurriculumTopic[];
}

/** Estrutura curricular completa de um nível (prompt do nível + árvore). */
export interface LevelCurriculum {
  level: Level;
  prompt: string;
  modules: CurriculumModule[];
}

/** Prompt Principal (global): persona, formato e diretrizes universais. */
export interface PrincipalPrompt {
  prompt: string;
}

/** Doc id fixo do Prompt Principal na coleção `curriculum`. */
export const PRINCIPAL_DOC_ID = 'principal';
