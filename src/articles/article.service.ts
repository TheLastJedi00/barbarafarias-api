import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ArticleRepository } from './article.repository';
import {
  Article,
  ARTICLE_STATUS,
  ArticleStatus,
  resolveArticleStatus,
} from './article.entity';
import {
  CreateArticleDto,
  UpdateArticleDto,
  ArticleSummaryDto,
  ArticleDto,
} from './dto/article.dto';
import { pickDefined } from '../common/patch';
import { UserRepository } from '../users/user.repository';
import { User } from '../users/user.entity';
import { ROLES } from '../types/role';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class ArticleService {
  constructor(
    private readonly repository: ArticleRepository,
    private readonly userRepository: UserRepository,
  ) {}

  /**
   * Biblioteca visível a quem pede (spec 011 RF10).
   *
   * Antes devolvia a coleção inteira, ignorando inclusive o `?status=` que o
   * painel da gerente mandava: rascunho e pendente apareciam como material
   * publicado para o aluno, e a fila de aprovação listava tudo.
   */
  async findAll(
    requester: AuthenticatedUser,
    status?: ArticleStatus,
  ): Promise<ArticleSummaryDto[]> {
    const articles = await this.repository.findAll();
    const visible = articles
      .filter((article) => this.canRead(requester, article))
      .filter((article) => !status || resolveArticleStatus(article) === status);
    return this.withAuthors(
      visible,
      (article, author) => new ArticleSummaryDto(article, author, requester),
    );
  }

  async findById(
    requester: AuthenticatedUser,
    id: string,
  ): Promise<ArticleDto> {
    const article = await this.getOr404(id);
    if (!this.canRead(requester, article)) {
      // 404 e não 403: quem não pode ler também não precisa saber que existe.
      throw new NotFoundException('Artigo não encontrado');
    }
    const author = await this.userRepository.findById(article.authorId);
    return new ArticleDto(article, author, requester);
  }

  /**
   * O JWT só carrega sub/email/role, então o nome de exibição vem do
   * documento do usuário — gravado junto do artigo para a listagem não
   * precisar de um join a cada leitura.
   *
   * Artigo da gerente já nasce publicado; o da professora entra na fila de
   * aprovação dela (RF7).
   */
  async create(
    dto: CreateArticleDto,
    user: AuthenticatedUser,
  ): Promise<ArticleDto> {
    const author = await this.userRepository.findById(user.sub);
    const now = new Date().toISOString();

    const article = await this.repository.create(
      new Article({
        ...dto,
        authorId: user.sub,
        authorName: author?.fullName,
        authorRole: user.role,
        status:
          user.role === ROLES.MANAGER
            ? ARTICLE_STATUS.PUBLISHED
            : ARTICLE_STATUS.PENDING,
        createdAt: now,
        updatedAt: now,
      }),
    );
    return new ArticleDto(article, author, user);
  }

  /**
   * Edição restrita ao autor e à gerente: sem isso qualquer professora
   * reescrevia o material publicado por outra pessoa.
   *
   * Reeditar um artigo que ainda não foi aprovado devolve-o à fila — é como
   * a professora reenvia depois de uma recusa. O que já está publicado
   * continua publicado (a gerente corrigindo um texto no ar não o tira do ar).
   */
  async update(
    requester: AuthenticatedUser,
    id: string,
    dto: UpdateArticleDto,
  ): Promise<ArticleDto> {
    const current = await this.getOr404(id);
    this.assertCanWrite(requester, current);

    const updated = new Article({
      ...current,
      ...pickDefined(dto),
      id,
      status:
        resolveArticleStatus(current) === ARTICLE_STATUS.PUBLISHED
          ? ARTICLE_STATUS.PUBLISHED
          : ARTICLE_STATUS.PENDING,
      updatedAt: new Date().toISOString(),
    });

    await this.repository.update(updated);
    const author = await this.userRepository.findById(updated.authorId);
    return new ArticleDto(updated, author, requester);
  }

  /** Aprovação da gerente: o artigo entra na biblioteca. */
  async approve(
    requester: AuthenticatedUser,
    id: string,
  ): Promise<ArticleDto> {
    return this.setStatus(requester, id, ARTICLE_STATUS.PUBLISHED);
  }

  /**
   * Recusa: volta para rascunho em vez de sumir. A autora continua vendo o
   * artigo na própria lista, corrige e o reenvia pela edição.
   */
  async reject(requester: AuthenticatedUser, id: string): Promise<ArticleDto> {
    return this.setStatus(requester, id, ARTICLE_STATUS.DRAFT);
  }

  async delete(requester: AuthenticatedUser, id: string): Promise<void> {
    const article = await this.getOr404(id);
    this.assertCanWrite(requester, article);
    await this.repository.delete(id);
  }

  private async setStatus(
    requester: AuthenticatedUser,
    id: string,
    status: ArticleStatus,
  ): Promise<ArticleDto> {
    const current = await this.getOr404(id);
    const updated = new Article({
      ...current,
      status,
      updatedAt: new Date().toISOString(),
    });
    await this.repository.update(updated);
    const author = await this.userRepository.findById(updated.authorId);
    return new ArticleDto(updated, author, requester);
  }

  private async getOr404(id: string): Promise<Article> {
    const article = await this.repository.findById(id);
    if (!article) {
      throw new NotFoundException('Artigo não encontrado');
    }
    return article;
  }

  /**
   * Aluno só enxerga o que está publicado. Professora enxerga o publicado
   * mais o que ela mesma escreveu (para acompanhar a própria fila). Gerente
   * enxerga tudo, porque é quem aprova.
   */
  private canRead(requester: AuthenticatedUser, article: Article): boolean {
    if (requester.role === ROLES.MANAGER) return true;
    if (resolveArticleStatus(article) === ARTICLE_STATUS.PUBLISHED) return true;
    return (
      requester.role === ROLES.TEACHER && article.authorId === requester.sub
    );
  }

  private assertCanWrite(
    requester: AuthenticatedUser,
    article: Article,
  ): void {
    if (requester.role === ROLES.MANAGER) return;
    if (article.authorId === requester.sub) return;
    throw new ForbiddenException('Este artigo é de outra autora');
  }

  private async withAuthors<T>(
    articles: Article[],
    map: (article: Article, author: User | null) => T,
  ): Promise<T[]> {
    // Um artigo por autora costuma repetir o mesmo id; busca uma vez cada.
    const authors = new Map<string, User | null>();
    for (const id of new Set(articles.map((a) => a.authorId))) {
      authors.set(id, await this.userRepository.findById(id));
    }
    return articles.map((article) =>
      map(article, authors.get(article.authorId) ?? null),
    );
  }
}
