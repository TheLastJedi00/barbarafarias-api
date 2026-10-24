import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import { VideoLessonService } from './video-lesson.service';
import {
  CreateVideoLessonDto,
  ReorderVideoLessonsDto,
  UpdateVideoLessonDto,
} from './dto/video-lesson.dto';

/**
 * Vídeo aulas (spec 027). Escrita é da professora (e da gerente, que herda o
 * papel); a leitura do aluno exige plano ativo e é restrita ao nível dele.
 */
@Controller('video-lessons')
export class VideoLessonController {
  constructor(private readonly service: VideoLessonService) {}

  /**
   * Cria a aula e devolve a URL de upload direto ao Storage. A `origin` vai
   * para a sessão para o GCS responder o CORS dos PUTs do navegador.
   */
  @Post()
  @Roles(ROLES.TEACHER)
  create(
    @Body() dto: CreateVideoLessonDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin?: string,
  ) {
    return this.service.create(dto, user, origin);
  }

  @Post(':id/upload-complete')
  @Roles(ROLES.TEACHER)
  @HttpCode(200)
  completeUpload(@Param('id') id: string) {
    return this.service.completeUpload(id);
  }

  @Post(':id/sync')
  @Roles(ROLES.TEACHER)
  @HttpCode(200)
  sync(@Param('id') id: string) {
    return this.service.sync(id);
  }

  @Patch(':id')
  @Roles(ROLES.TEACHER)
  update(@Param('id') id: string, @Body() dto: UpdateVideoLessonDto) {
    return this.service.update(id, dto);
  }

  @Put('topics/:topicId/order')
  @Roles(ROLES.TEACHER)
  @HttpCode(204)
  reorder(
    @Param('topicId') topicId: string,
    @Body() dto: ReorderVideoLessonsDto,
  ) {
    return this.service.reorder(topicId, dto);
  }

  @Delete(':id')
  @Roles(ROLES.TEACHER)
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
