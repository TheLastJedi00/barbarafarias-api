import { StudentInfo } from '../types/student.info';

/**
 * Composição dos prompts do fluxo granular.
 *
 * O prompt-base por nível (coleção `prompts` no Firestore) é reusado como
 * CONTEXTO PEDAGÓGICO compartilhado — tom, público-alvo, diretrizes da Teacher.
 * As instruções de FORMATO de saída são anexadas aqui em código, específicas
 * de cada etapa (esqueleto vs. tópico único). O contrato de saída é garantido
 * de fato por JSON mode + validação Zod no GeminiProvider, não pelo texto.
 */

/** Bloco de dados do aluno, comum às duas etapas. */
function studentBlock(student: StudentInfo): string {
  return `Dados do aluno:
Nome: ${student.firstName}
Objetivos pessoais do aluno: ${student.objectives}
Prognóstico da Teacher: ${student.prognosis}`;
}

/**
 * Etapa 1 — Esqueleto ("planta baixa"): só a estrutura, sem conteúdo pesado.
 */
export function buildSkeletonPrompt(
  basePrompt: string,
  student: StudentInfo,
): string {
  return `${basePrompt}

${studentBlock(student)}

INSTRUÇÃO DESTA ETAPA (ESQUELETO):
Gere APENAS a planta baixa do material, sem nenhum conteúdo de tópico.
Para cada módulo devolva: "title" (título do módulo), "text" (uma introdução
curta do módulo) e "topics" (a lista de tópicos do módulo, cada um apenas com
o campo "topic" = título do tópico).
NÃO gere description, examples, curiosity, roleplay, words nem music nesta etapa.
Responda SOMENTE com um array JSON no formato:
[
  { "title": "...", "text": "...", "topics": [ { "topic": "..." } ] }
]`;
}

/**
 * Etapa 2 — Conteúdo completo de UM único tópico, dado o módulo e o título.
 */
export function buildTopicPrompt(
  basePrompt: string,
  student: StudentInfo,
  moduleTitle: string,
  topicTitle: string,
): string {
  return `${basePrompt}

${studentBlock(student)}

INSTRUÇÃO DESTA ETAPA (TÓPICO ÚNICO):
Gere o conteúdo COMPLETO de UM único tópico do material, e nada além dele.
Contexto:
- Módulo: "${moduleTitle}"
- Tópico: "${topicTitle}"

Responda SOMENTE com um objeto JSON no formato:
{
  "topic": "${topicTitle}",
  "description": "...",
  "examples": ["..."],
  "curiosity": "...",
  "roleplayInstruction": "...",
  "roleplayDialog": ["..."],
  "words": [ { "english": "...", "portuguese": "...", "pronounce": "..." } ],
  "music": { "title": "...", "artist": "...", "youtube": "..." }
}`;
}
