import { Injectable, NotFoundException } from '@nestjs/common';
import { ArticleRepository } from './article.repository';
import { Article } from './article.entity';
import { CreateArticleDto, UpdateArticleDto, ArticleSummaryDto, ArticleDto } from './dto/article.dto';
import { pickDefined } from '../common/patch';
import { UserRepository } from '../users/user.repository';

@Injectable()
export class ArticleService {
  constructor(
    private readonly repository: ArticleRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async findAll(): Promise<ArticleSummaryDto[]> {
    const articles = await this.repository.findAll();
    return Promise.all(
      articles.map(async (a) => {
        const user = await this.userRepository.findById(a.authorId);
        return new ArticleSummaryDto(a, user);
      }),
    );
  }

  async findById(id: string): Promise<ArticleDto> {
    const article = await this.repository.findById(id);
    if (!article) {
      throw new NotFoundException('Artigo não encontrado');
    }
    const user = await this.userRepository.findById(article.authorId);
    return new ArticleDto(article, user);
  }

  /**
   * O JWT só carrega sub/email/role, então o nome de exibição vem do
   * documento do usuário — gravado junto do artigo para a listagem não
   * precisar de um join a cada leitura.
   */
  async create(dto: CreateArticleDto, user: { sub: string; role: string }): Promise<ArticleDto> {
    const author = await this.userRepository.findById(user.sub);
    const now = new Date().toISOString();
    const status = user.role === 'manager' ? 'published' : 'pending';
    
    const article = await this.repository.create(
      new Article({
        ...dto,
        authorId: user.sub,
        authorName: author?.fullName,
        authorRole: user.role,
        status,
        createdAt: now,
        updatedAt: now,
      }),
    );
    return new ArticleDto(article, author);
  }

  async update(id: string, dto: UpdateArticleDto): Promise<ArticleDto> {
    const articleDto = await this.findById(id); // to ensure it exists
    const articleEntity = await this.repository.findById(id);
    const updated = new Article({
      ...articleEntity,
      ...pickDefined(dto),
      id,
      updatedAt: new Date().toISOString(),
    });
    await this.repository.update(updated);
    const author = await this.userRepository.findById(updated.authorId);
    return new ArticleDto(updated, author);
  }

  async approve(id: string): Promise<ArticleDto> {
    const articleEntity = await this.repository.findById(id);
    if (!articleEntity) {
      throw new NotFoundException('Artigo não encontrado');
    }
    const updated = new Article({
      ...articleEntity,
      status: 'published',
      updatedAt: new Date().toISOString(),
    });
    await this.repository.update(updated);
    const author = await this.userRepository.findById(updated.authorId);
    return new ArticleDto(updated, author);
  }

  async delete(id: string): Promise<void> {
    await this.findById(id); // 404 explícito em vez de delete silencioso
    await this.repository.delete(id);
  }
}
