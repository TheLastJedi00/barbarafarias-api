/**
 * Andamento da geração de um baralho (fix 037). O Gemini devolve o JSON
 * `{"cards":[{...},{...}]}` aos pedaços; aqui se conta quantas cartas já
 * chegaram inteiras no texto acumulado, sem tentar fazer o parse de um JSON
 * pela metade.
 *
 * Profundidade: o objeto raiz é 1, o array `cards` é 2 e cada carta é 3.
 * Uma carta termina quando um `}` fecha a profundidade 3. Chaves e colchetes
 * dentro de strings (com aspas escapadas) não contam.
 */
export function countCompleteCards(text: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      if (ch === '}' && depth === 3) count++;
      depth--;
    }
  }
  return count;
}

/** O que a tela mostra enquanto o baralho do aluno é gerado. */
export interface DeckProgress {
  generated: number;
  total: number;
}
