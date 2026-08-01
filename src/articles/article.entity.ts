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
  status?: 'draft' | 'pending' | 'published';
  createdAt!: string; // ISO
  updatedAt!: string; // ISO

  constructor(data: Partial<Article>) {
    Object.assign(this, data);
  }
}
