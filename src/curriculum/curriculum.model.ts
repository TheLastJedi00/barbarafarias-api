import { Level } from '../types/student.level';

/**
 * Tópico: unidade mínima de geração. `title` é o título que a Teacher cadastra
 * no painel e que chega ao aluno — a geração o usa como âncora do conteúdo, e
 * não inventa mais o seu próprio.
 *
 * Chamava-se `prompt` até a spec 020, herdado de um desenho de "instrução
 * granular" que a implementação nunca seguiu. Docs gravados antes do rename
 * ainda têm o campo antigo; a normalização mora no repositório.
 */
export interface CurriculumTopic {
  id: string;
  title: string;
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
