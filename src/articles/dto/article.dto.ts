import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Article } from '../article.entity';
import { User } from '../../users/user.entity';

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

export class ArticleSummaryDto {
  id: string;
  title: string;
  coverImageUrl?: string;
  status: string;
  authorRole: string;
  author: {
    id: string;
    name: string;
    avatarUrl?: string;
    bio?: string;
    phone?: string;
  };
  createdAt: string;
  updatedAt: string;
  excerpt: string;

  constructor(article: Article, authorUser?: User | null) {
    this.id = article.id!;
    this.title = article.title;
    this.coverImageUrl = article.coverImageUrl;
    this.status = article.status ?? 'draft';
    this.authorRole = article.authorRole ?? 'teacher';
    this.author = {
      id: article.authorId,
      name: authorUser?.fullName ?? article.authorName ?? '',
      avatarUrl: authorUser?.profileImageUrl,
      bio: authorUser?.bio,
      phone: authorUser?.phone,
    };
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
  status: string;
  authorRole: string;
  author: {
    id: string;
    name: string;
    avatarUrl?: string;
    bio?: string;
    phone?: string;
  };
  createdAt: string;
  updatedAt: string;

  constructor(article: Article, authorUser?: User | null) {
    this.id = article.id!;
    this.title = article.title;
    this.content = article.content;
    this.coverImageUrl = article.coverImageUrl;
    this.status = article.status ?? 'draft';
    this.authorRole = article.authorRole ?? 'teacher';
    this.author = {
      id: article.authorId,
      name: authorUser?.fullName ?? article.authorName ?? '',
      avatarUrl: authorUser?.profileImageUrl,
      bio: authorUser?.bio,
      phone: authorUser?.phone,
    };
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
