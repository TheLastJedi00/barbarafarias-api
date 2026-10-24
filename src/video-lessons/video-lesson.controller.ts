import {
  Body,
  Controller,
  BadRequestException,
  Delete,
  Get,
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
import { LEVELS, type Level } from '../types/student.level';
import { RequiresActivePlan } from '../guards/active-plan.guard';
import { VideoLessonService } from './video-lesson.service';
import {
  CreateMaterialDto,
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

  /** Árvore do aluno: o próprio nível, só aulas prontas. */
  @Get('me')
  @Roles(ROLES.STUDENT)
  @RequiresActivePlan()
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getStudentTree(user);
  }

  @Get('levels/:level')
  @Roles(ROLES.TEACHER)
  getLevel(@Param('level') level: string) {
    return this.service.getTeacherTree(parseLevel(level));
  }

  /**
   * Leitura de uma aula. Aberta a aluno e professora; o service aplica a regra
   * do nível, e o guard de plano só pesa para o aluno.
   */
  @Get(':id')
  @Roles(ROLES.STUDENT, ROLES.TEACHER)
  @RequiresActivePlan()
  getDetail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getDetail(id, user);
  }

  @Get(':id/playback')
  @Roles(ROLES.STUDENT, ROLES.TEACHER)
  @RequiresActivePlan()
  getPlayback(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getPlayback(id, user);
  }

  @Get(':id/materials/:materialId/download')
  @Roles(ROLES.STUDENT, ROLES.TEACHER)
  @RequiresActivePlan()
  getMaterialDownload(
    @Param('id') id: string,
    @Param('materialId') materialId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getMaterialDownload(id, materialId, user);
  }

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

  @Post(':id/materials')
  @Roles(ROLES.TEACHER)
  addMaterial(
    @Param('id') id: string,
    @Body() dto: CreateMaterialDto,
    @Headers('origin') origin?: string,
  ) {
    return this.service.addMaterial(id, dto, origin);
  }

  @Post(':id/materials/:materialId/complete')
  @Roles(ROLES.TEACHER)
  @HttpCode(200)
  completeMaterial(
    @Param('id') id: string,
    @Param('materialId') materialId: string,
  ) {
    return this.service.completeMaterial(id, materialId);
  }

  @Delete(':id/materials/:materialId')
  @Roles(ROLES.TEACHER)
  @HttpCode(204)
  removeMaterial(
    @Param('id') id: string,
    @Param('materialId') materialId: string,
  ) {
    return this.service.removeMaterial(id, materialId);
  }
}

function parseLevel(level: string): Level {
  if (!(LEVELS as readonly string[]).includes(level)) {
    throw new BadRequestException(
      `Nível inválido: "${level}". Use um de ${LEVELS.join(', ')}.`,
    );
  }
  return level as Level;
}
