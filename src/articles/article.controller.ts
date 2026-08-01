import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ArticleService } from './article.service';
import {
  ArticleSummaryDto,
  CreateArticleDto,
  ListArticlesQueryDto,
  UpdateArticleDto,
  ArticleDto,
} from './dto/article.dto';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';

/**
 * Material de apoio no lugar da antiga página do IPA (spec 011 RF7/RF10).
 *
 * Gerente e professora escrevem; o artigo da professora entra na fila de
 * aprovação. A leitura é aberta a qualquer usuário autenticado, mas o que
 * cada um enxerga depende do status — o recorte é do service, não do cliente.
 */
@Controller('articles')
@Roles(ROLES.MANAGER)
export class ArticleController {
  constructor(private readonly service: ArticleService) {}

  @Get()
  @Roles(ROLES.MANAGER, ROLES.TEACHER, ROLES.STUDENT)
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListArticlesQueryDto,
  ): Promise<ArticleSummaryDto[]> {
    return this.service.findAll(user, query.status);
  }

  @Get(':id')
  @Roles(ROLES.MANAGER, ROLES.TEACHER, ROLES.STUDENT)
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ArticleDto> {
    return this.service.findById(user, id);
  }

  @Post()
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateArticleDto,
  ): Promise<ArticleDto> {
    return this.service.create(dto, user);
  }

  /** Autor ou gerente — a checagem de autoria mora no service. */
  @Put(':id')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
  ): Promise<ArticleDto> {
    return this.service.update(user, id, dto);
  }

  @Post(':id/approve')
  @Roles(ROLES.MANAGER)
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ArticleDto> {
    return this.service.approve(user, id);
  }

  /** Recusa devolve o artigo a rascunho para a autora corrigir e reenviar. */
  @Post(':id/reject')
  @Roles(ROLES.MANAGER)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ArticleDto> {
    return this.service.reject(user, id);
  }

  @Delete(':id')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  @HttpCode(204)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.service.delete(user, id);
  }
}
