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
  ArticleDto,
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
    return this.service.findAll();
  }

  @Get(':id')
  @Roles(ROLES.MANAGER, ROLES.TEACHER, ROLES.STUDENT)
  findById(@Param('id') id: string): Promise<ArticleDto> {
    return this.service.findById(id);
  }

  @Post()
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateArticleDto,
  ): Promise<ArticleDto> {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
  ): Promise<ArticleDto> {
    return this.service.update(id, dto);
  }

  @Post(':id/approve')
  @Roles(ROLES.MANAGER)
  approve(@Param('id') id: string): Promise<ArticleDto> {
    return this.service.approve(id);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string): Promise<void> {
    return this.service.delete(id);
  }
}
