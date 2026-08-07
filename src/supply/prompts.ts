import { StudentInfo } from '../types/student.info';
import { Blueprint } from '../curriculum/curriculum.service';

/**
 * Composição dos prompts do fluxo granular.
 *
 * O prompt-base é o Prompt Principal + o prompt do nível, ambos escritos pela
 * Teacher no painel `/prompt-manager` (coleção `curriculum`), e serve de
 * CONTEXTO PEDAGÓGICO compartilhado — tom, público-alvo, diretrizes. As
 * instruções de FORMATO de saída são anexadas aqui em código, específicas de
 * cada etapa (intros de módulo vs. tópico único). O contrato de saída é
 * garantido de fato por JSON mode + validação Zod no GeminiProvider, não pelo
 * texto.
 */

/** Bloco de dados do aluno, comum às duas etapas. */
function studentBlock(student: StudentInfo): string {
  return `Dados do aluno:
Nome: ${student.firstName}
Objetivos pessoais do aluno: ${student.objectives}
Prognóstico da Teacher: ${student.prognosis}`;
}

/**
 * Etapa 1 — Intros dos módulos. A estrutura já está decidida pela Teacher; a
 * IA só escreve o texto de abertura que o aluno lê ao entrar em cada módulo.
 *
 * Os títulos dos tópicos vão no prompt de propósito: é o que permite à intro
 * dizer o que o módulo vai abordar em vez de falar genericamente do tema.
 */
export function buildModuleIntrosPrompt(
  basePrompt: string,
  student: StudentInfo,
  blueprint: Blueprint,
): string {
  const modules = blueprint.modules
    .map((mod, index) => {
      const topics = mod.topics.map((t) => `    - ${t.title}`).join('\n');
      const context = mod.context.trim()
        ? `\n  Diretriz da Teacher para este módulo: ${mod.context}`
        : '';
      return `${index + 1}. ${mod.title}${context}\n  Tópicos:\n${topics}`;
    })
    .join('\n\n');

  return `${basePrompt}

${studentBlock(student)}

ESTRUTURA DO MATERIAL (definida pela Teacher — NÃO altere, NÃO acrescente e
NÃO remova módulos ou tópicos):

${modules}

INSTRUÇÃO DESTA ETAPA (INTRODUÇÕES DOS MÓDULOS):
Escreva a introdução de cada módulo, dirigida diretamente ao aluno
${student.firstName}, em português, de 2 a 4 frases.
Cada introdução deve dizer o que o módulo vai abordar (apoiando-se nos títulos
dos tópicos acima) e conectar isso aos objetivos pessoais do aluno e ao
prognóstico da Teacher. Fale com o aluno na segunda pessoa, com tom acolhedor.
NÃO repita o título do módulo como primeira frase e NÃO gere conteúdo de
tópico (nada de description, examples, curiosity, roleplay, words ou music).
Responda SOMENTE com um array JSON de strings, uma por módulo, na MESMA ORDEM
da estrutura acima e com exatamente ${blueprint.modules.length} ${
    blueprint.modules.length === 1 ? 'item' : 'itens'
  }:
["introdução do módulo 1", "introdução do módulo 2"]`;
}

/**
 * Etapa 2 — Conteúdo completo de UM único tópico, dado o módulo e o título.
 *
 * `moduleContext` é a diretriz temática que a Teacher escreveu para o módulo no
 * painel. É opcional: módulos sem diretriz simplesmente não a mandam.
 */
export function buildTopicPrompt(
  basePrompt: string,
  student: StudentInfo,
  moduleTitle: string,
  topicTitle: string,
  moduleContext = '',
): string {
  const context = moduleContext.trim()
    ? `\n- Diretriz da Teacher para este módulo: ${moduleContext.trim()}`
    : '';

  return `${basePrompt}

${studentBlock(student)}

INSTRUÇÃO DESTA ETAPA (TÓPICO ÚNICO):
Gere o conteúdo COMPLETO de UM único tópico do material, e nada além dele.
Contexto:
- Módulo: "${moduleTitle}"
- Tópico: "${topicTitle}"${context}

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
