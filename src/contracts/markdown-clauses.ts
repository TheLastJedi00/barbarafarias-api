import type { ContractClause } from './contract.entity';

/**
 * O termo publicado no Jurídico (spec 029) é Markdown; o contrato guarda
 * cláusulas. Cada título vira uma cláusula com o texto até o próximo título;
 * a marcação inline sai (negrito, itálico, código, link vira só o texto) e o
 * item de lista vira "•". Texto antes do primeiro título vira "Preâmbulo".
 */
export function clausesFromMarkdown(markdown: string): ContractClause[] {
  const clauses: ContractClause[] = [];
  let current: { title: string; lines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const body = current.lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (current.title || body) clauses.push({ title: current.title, body });
  };

  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const heading = /^#{1,6}\s+(.*)$/.exec(raw.trim());
    if (heading) {
      flush();
      current = { title: inline(heading[1]), lines: [] };
      continue;
    }
    if (!current) current = { title: 'Preâmbulo', lines: [] };
    const item = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(raw);
    current.lines.push(item ? `• ${inline(item[1])}` : inline(raw.trim()));
  }
  flush();
  return clauses;
}

function inline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}
