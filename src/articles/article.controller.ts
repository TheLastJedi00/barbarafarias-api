import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ArticleService } from './article.service';
import {
  ArticleSummaryDto,
  CreateArticleDto,
  UpdateArticleDto,
} from './dto/article.dto';
import { Article } from './article.entity';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';

/**
 * Escrita é exclusiva da gerente (spec 011 RF7); leitura fica aberta a
 * qualquer usuário autenticado — é o material de apoio que aluno e professora
 * consultam, no lugar da antiga página do IPA (RF10).
 */
@Controller('articles')
@Roles(ROLES.MANAGER)
export class ArticleController {
  constructor(private readonly service: ArticleService) {}

  @Get()
  @Roles(ROLES.MANAGER, ROLES.TEACHER, ROLES.STUDENT)
  async findAll(): Promise<ArticleSummaryDto[]> {
    const articles = await this.service.findAll();
    return articles.map((article) => new ArticleSummaryDto(article));
  }

  @Get(':id')
  @Roles(ROLES.MANAGER, ROLES.TEACHER, ROLES.STUDENT)
  findById(@Param('id') id: string): Promise<Article> {
    return this.service.findById(id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateArticleDto,
  ): Promise<Article> {
    return this.service.create(dto, user.sub);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
  ): Promise<Article> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string): Promise<void> {
    return this.service.delete(id);
  }
}
