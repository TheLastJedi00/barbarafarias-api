import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Param,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from './storage.service';
import type { UploadFolder } from './storage.service';
import { Roles } from '../decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { ROLES, type Role } from '../types/role';

/** Teto por arquivo. A imagem chega já comprimida pelo cliente (~50–300 KB). */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ALL_ROLES: Role[] = [ROLES.MANAGER, ROLES.TEACHER, ROLES.STUDENT];

/**
 * Quem sobe em cada pasta. `avatars` e `articles` seguem abertas aos três
 * papéis (ver o comentário da rota); `artworks` (spec 031) é da gerente: as
 * fotos e prévias da Campanha não têm outro dono que as restrinja depois.
 */
const FOLDER_ROLES: Record<UploadFolder, Role[]> = {
  avatars: ALL_ROLES,
  articles: ALL_ROLES,
  artworks: [ROLES.MANAGER],
};
const FOLDERS = Object.keys(FOLDER_ROLES) as UploadFolder[];

/**
 * Recebe a imagem **já comprimida no navegador** (spec 011 §3) e devolve a URL
 * pública no Storage. Quem grava a URL no documento é o módulo dono do dado —
 * perfil ou artigo —, não este.
 */
@Controller('uploads')
export class UploadController {
  constructor(private readonly storage: StorageService) {}

  /**
   * `avatars` é aberto a qualquer usuário autenticado: o aluno troca a própria
   * foto (RF14). `articles` fica restrito no controller de artigos, que é quem
   * grava a capa — aqui basta impedir pasta arbitrária.
   */
  @Post(':folder')
  @Roles(ROLES.MANAGER, ROLES.TEACHER, ROLES.STUDENT)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async upload(
    @Param('folder') folder: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ })
        .addMaxSizeValidator({ maxSize: MAX_UPLOAD_BYTES })
        .build({ fileIsRequired: true }),
    )
    file: { buffer: Buffer; mimetype: string },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ url: string; path: string }> {
    if (!FOLDERS.includes(folder as UploadFolder)) {
      throw new BadRequestException(
        `Pasta inválida. Use uma de: ${FOLDERS.join(', ')}`,
      );
    }
    if (!FOLDER_ROLES[folder as UploadFolder].includes(user.role)) {
      throw new ForbiddenException('Sem permissão para esta pasta.');
    }
    return this.storage.upload(file, folder as UploadFolder);
  }
}
