import { studentBlock } from '../supply/prompts';
import { StudentInfo } from '../types/student.info';
import { Level } from '../types/student.level';
import { PARTS_OF_SPEECH } from './flashcard.model';

/**
 * Prompts dos baralhos de flashcards (spec 037 §4).
 *
 * Composição: Prompt de Flashcards (editável, `curriculum/flashcards`) +
 * prompt do nível (o mesmo da geração do material) + o assunto do baralho
 * (tópico ou aluno) + a instrução de formato, que fica aqui em código porque é
 * contrato com o parser, não pedagogia.
 */

interface BaseInput {
  flashcardsPrompt: string;
  levelPrompt: string;
  level: Level;
  /** Quantas cartas pedir. O BE pede um pouco mais do que guarda no do aluno. */
  count: number;
}

export interface TopicDeckPromptInput extends BaseInput {
  moduleTitle: string;
  moduleContext: string;
  topicTitle: string;
}

export interface StudentDeckPromptInput extends BaseInput {
  student: StudentInfo;
  /**
   * Palavras que o aluno já vê nos baralhos dos tópicos do nível (e, na
   * segunda chamada, as já aceitas). Sem a lista a IA escolhe justamente esse
   * vocabulário, e o filtro do BE descarta mais da metade (fix 037-2).
   */
  avoid?: string[];
}

export function buildTopicDeckPrompt(input: TopicDeckPromptInput): string {
  const context = input.moduleContext.trim()
    ? `\n- Diretriz da Teacher para este módulo: ${input.moduleContext.trim()}`
    : '';
  return compose(input, [
    `ASSUNTO DO BARALHO:
- Módulo: "${input.moduleTitle}"
- Tópico: "${input.topicTitle}"${context}
As palavras têm que servir para falar deste tópico. Prefira o vocabulário que
um aluno do nível usaria numa conversa real sobre ele.`,
  ]);
}

export function buildStudentDeckPrompt(input: StudentDeckPromptInput): string {
  const { student } = input;
  const base = student.profile
    ? 'a área de trabalho, a etapa na carreira e o contato com o inglês'
    : 'os objetivos pessoais e o prognóstico da Teacher';
  return compose(input, [
    studentBlock(student),
    `ASSUNTO DO BARALHO:
Palavras do dia a dia de ${student.firstName}, tiradas de ${base} acima.
Pense nas situações que essa pessoa vive (trabalho, rotina, metas) e escolha o
vocabulário que ela precisa nelas. Nada de temas genéricos de livro didático
(cores, números, família, clima) a menos que os dados peçam.`,
    avoidBlock(input.avoid ?? []),
  ]);
}

function avoidBlock(words: string[]): string {
  if (words.length === 0) return '';
  return `PALAVRAS QUE JÁ ESTÃO NOS OUTROS BARALHOS — NÃO USE nenhuma delas, nem
outra forma da mesma palavra (plural, conjugação, "to" do infinitivo):
${words.join(', ')}`;
}

function compose(input: BaseInput, subject: string[]): string {
  const format = `FORMATO:
Responda SOMENTE com um objeto JSON com exatamente ${input.count} cartas, sem repetir palavra:
{
  "cards": [
    {
      "english": "palavra ou bloco curto em inglês",
      "portuguese": "tradução natural no contexto",
      "pronounce": "pronúncia para brasileiro, tônica em maiúsculas",
      "partOfSpeech": "${PARTS_OF_SPEECH.join('" | "')}",
      "example": "frase em inglês, até 12 palavras",
      "exampleTranslation": "a frase em português"
    }
  ]
}`;

  return [
    input.flashcardsPrompt,
    input.levelPrompt,
    `Nível do aluno: ${input.level}`,
    ...subject,
    format,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
}
