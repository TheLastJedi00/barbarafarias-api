/**
 * Ciclo de vida do artigo (spec 011 RF7 + Fix 21).
 *
 * `draft` é para onde a recusa da gerente devolve o texto; `pending` é a fila
 * de aprovação; `published` é o que entra na biblioteca do aluno.
 */
export const ARTICLE_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  PUBLISHED: 'published',
} as const;

export type ArticleStatus =
  (typeof ARTICLE_STATUS)[keyof typeof ARTICLE_STATUS];

/**
 * Artigo de material de apoio (spec 011 RF7–RF10). Substitui a antiga página
 * do IPA como repositório de conteúdo escrito.
 *
 * `content` guarda Markdown cru — a renderização (e a sanitização contra XSS)
 * acontece no front. `coverImageUrl` aponta para o Firebase Storage; o binário
 * nunca entra no Firestore (§3 das decisões de arquitetura).
 */
export class Article {
  id?: string;
  title!: string;
  content!: string;
  coverImageUrl?: string;
  authorId!: string;
  authorName?: string;
  authorRole?: string;
  /** Ausente nos artigos da Fase 3, anteriores ao fluxo de aprovação. */
  status?: ArticleStatus;
  createdAt!: string; // ISO
  updatedAt!: string; // ISO

  constructor(data: Partial<Article>) {
    Object.assign(this, data);
  }
}

/**
 * Status efetivo de um artigo.
 *
 * Os artigos da Fase 3 foram gravados antes do campo existir. Todos eram da
 * gerente e já estavam no ar, então a ausência vale como `published` — ler
 * como `draft` faria o material antigo sumir da biblioteca do aluno no dia
 * em que o filtro por status entrasse.
 */
export function resolveArticleStatus(article: {
  status?: ArticleStatus;
  authorRole?: string;
}): ArticleStatus {
  if (article.status) return article.status;
  return article.authorRole === 'teacher'
    ? ARTICLE_STATUS.PENDING
    : ARTICLE_STATUS.PUBLISHED;
}
