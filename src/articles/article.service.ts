import { Injectable, NotFoundException } from '@nestjs/common';
import { ArticleRepository } from './article.repository';
import { Article } from './article.entity';
import { CreateArticleDto, UpdateArticleDto } from './dto/article.dto';
import { pickDefined } from '../common/patch';
import { UserRepository } from '../users/user.repository';

@Injectable()
export class ArticleService {
  constructor(
    private readonly repository: ArticleRepository,
    private readonly userRepository: UserRepository,
  ) {}

  findAll(): Promise<Article[]> {
    return this.repository.findAll();
  }

  async findById(id: string): Promise<Article> {
    const article = await this.repository.findById(id);
    if (!article) {
      throw new NotFoundException('Artigo não encontrado');
    }
    return article;
  }

  /**
   * O JWT só carrega sub/email/role, então o nome de exibição vem do
   * documento do usuário — gravado junto do artigo para a listagem não
   * precisar de um join a cada leitura.
   */
  async create(dto: CreateArticleDto, authorId: string): Promise<Article> {
    const author = await this.userRepository.findById(authorId);
    const now = new Date().toISOString();
    return this.repository.create(
      new Article({
        ...dto,
        authorId,
        authorName: author?.fullName,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  async update(id: string, dto: UpdateArticleDto): Promise<Article> {
    const article = await this.findById(id);
    const updated = new Article({
      ...article,
      ...pickDefined(dto),
      id,
      updatedAt: new Date().toISOString(),
    });
    await this.repository.update(updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.findById(id); // 404 explícito em vez de delete silencioso
    await this.repository.delete(id);
  }
}
