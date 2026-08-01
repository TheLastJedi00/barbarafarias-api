import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Article } from '../article.entity';

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

/**
 * Item de listagem: sem o corpo em Markdown, que pode ser longo. A lista de
 * artigos do aluno carrega dezenas de registros e não precisa do texto inteiro.
 */
export class ArticleSummaryDto {
  id: string;
  title: string;
  coverImageUrl?: string;
  authorName?: string;
  createdAt: string;
  updatedAt: string;
  excerpt: string;

  constructor(article: Article) {
    this.id = article.id!;
    this.title = article.title;
    this.coverImageUrl = article.coverImageUrl;
    this.authorName = article.authorName;
    this.createdAt = article.createdAt;
    this.updatedAt = article.updatedAt;
    this.excerpt = buildExcerpt(article.content);
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
