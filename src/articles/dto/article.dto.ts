import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ARTICLE_STATUS, resolveArticleStatus } from '../article.entity';
import type { Article, ArticleStatus } from '../article.entity';
import { User } from '../../users/user.entity';
import { ROLES } from '../../types/role';
import type { AuthenticatedUser } from '../../decorators/current-user.decorator';

export class CreateArticleDto {
  @IsString()
  @IsNotEmpty({ message: 'O título é obrigatório' })
  @MaxLength(160)
  title!: string;

  @IsString()
  @IsNotEmpty({ message: 'O conteúdo é obrigatório' })
  content!: string;

  @IsString()
  @IsOptional()
  coverImageUrl?: string;
}

export class UpdateArticleDto {
  @IsString()
  @IsOptional()
  @MaxLength(160)
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  coverImageUrl?: string;
}

/** Filtro da listagem — é o `?status=` que o painel da gerente manda. */
export class ListArticlesQueryDto {
  @IsIn(Object.values(ARTICLE_STATUS))
  @IsOptional()
  status?: ArticleStatus;
}

export interface ArticleAuthorView {
  id: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  phone?: string;
}

/**
 * Autor exibido no card e no modal de "Sobre o Autor".
 *
 * O telefone respeita o mesmo interruptor do `PublicTeacherDto`: enquanto
 * esta view o entregava sempre, o modal do artigo furava o toggle que a
 * professora controla em `/perfil` e mostrava o número dela a qualquer aluno.
 */
function buildAuthor(
  article: Article,
  author: User | null | undefined,
  requester?: AuthenticatedUser,
): ArticleAuthorView {
  const isSelf = !!requester && requester.sub === article.authorId;
  const canSeePhone =
    requester?.role === ROLES.MANAGER || isSelf || !!author?.phoneVisibleToStudent;

  return {
    id: article.authorId,
    name: author?.fullName ?? article.authorName ?? '',
    avatarUrl: author?.profileImageUrl,
    bio: author?.bio,
    phone: canSeePhone ? author?.phone : undefined,
  };
}

export class ArticleSummaryDto {
  id: string;
  title: string;
  coverImageUrl?: string;
  status: ArticleStatus;
  authorRole: string;
  author: ArticleAuthorView;
  createdAt: string;
  updatedAt: string;
  excerpt: string;

  constructor(
    article: Article,
    authorUser?: User | null,
    requester?: AuthenticatedUser,
  ) {
    this.id = article.id!;
    this.title = article.title;
    this.coverImageUrl = article.coverImageUrl;
    this.status = resolveArticleStatus(article);
    this.authorRole = article.authorRole ?? ROLES.MANAGER;
    this.author = buildAuthor(article, authorUser, requester);
    this.createdAt = article.createdAt;
    this.updatedAt = article.updatedAt;
    this.excerpt = buildExcerpt(article.content);
  }
}

export class ArticleDto {
  id: string;
  title: string;
  content: string;
  coverImageUrl?: string;
  status: ArticleStatus;
  authorRole: string;
  author: ArticleAuthorView;
  createdAt: string;
  updatedAt: string;

  constructor(
    article: Article,
    authorUser?: User | null,
    requester?: AuthenticatedUser,
  ) {
    this.id = article.id!;
    this.title = article.title;
    this.content = article.content;
    this.coverImageUrl = article.coverImageUrl;
    this.status = resolveArticleStatus(article);
    this.authorRole = article.authorRole ?? ROLES.MANAGER;
    this.author = buildAuthor(article, authorUser, requester);
    this.createdAt = article.createdAt;
    this.updatedAt = article.updatedAt;
  }
}

/** Primeiras linhas do Markdown em texto puro, para o card da listagem. */
function buildExcerpt(content: string, limit = 180): string {
  const plain = content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // imagens
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links viram o rótulo
    .replace(/[#>*_`~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > limit ? `${plain.slice(0, limit).trimEnd()}…` : plain;
}
