import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Roles } from '../decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import { ArtworkService } from './artwork.service';
import {
  CreateArtworkDto,
  GenerateSlideDto,
  ListArtworksQueryDto,
  StoredFileDto,
} from './dto/artwork.dto';

/**
 * Artes da Campanha (spec 031 §3). Só a gerente. As duas rotas que chamam o
 * Gemini têm freio próprio: cada chamada custa, e um clique repetido não
 * pode virar dezenas delas.
 */
@Controller('brand-studio/artworks')
@Roles(ROLES.MANAGER)
export class ArtworkController {
  constructor(private readonly service: ArtworkService) {}

  @Get()
  list(@Query() query: ListArtworksQueryDto) {
    return this.service.list(query.limit, query.before);
  }

  /** Primeira etapa: o roteiro. A arte nasce em rascunho, sem HTML. */
  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(
    @Body() dto: CreateArtworkDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  /** Segunda etapa: o HTML de um slide (ou refazê-lo, com `note`). */
  @Post(':id/slides/:index')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  generateSlide(
    @Param('id') id: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() dto: GenerateSlideDto,
  ) {
    return this.service.generateSlide(id, index, dto);
  }

  /** Foto anexada, servida pela API: o front a embute no PNG (fix 031). */
  @Get(':id/photos/:index')
  // A foto não muda (troca de foto é um arquivo novo): o navegador guarda.
  @Header('Cache-Control', 'private, max-age=3600')
  async photo(
    @Param('id') id: string,
    @Param('index', ParseIntPipe) index: number,
  ) {
    const file = await this.service.photo(id, index);
    return new StreamableFile(file.data, {
      type: file.contentType,
      length: file.data.length,
    });
  }

  @Patch(':id/slides/:index/preview')
  setPreview(
    @Param('id') id: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() dto: StoredFileDto,
  ) {
    return this.service.setPreview(id, index, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
