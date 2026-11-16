import {
  Body,
  Controller,
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
import { ROLES } from '../types/role';
import {
  CreateStoreFileDto,
  CreateStoreProductDto,
  ReorderStoreProductsDto,
  UpdateStoreProductDto,
} from './dto/store-product.dto';
import { StoreAdminService } from './store-admin.service';

/** Gestão do catálogo da loja (spec 032 §9). Só a gerente. */
@Controller('store/admin/products')
@Roles(ROLES.MANAGER)
export class StoreAdminController {
  constructor(private readonly service: StoreAdminService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() dto: CreateStoreProductDto) {
    return this.service.create(dto);
  }

  @Put('order')
  @HttpCode(204)
  reorder(@Body() dto: ReorderStoreProductsDto) {
    return this.service.reorder(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStoreProductDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  /** Abre a sessão de upload direto ao Storage (mesmo caminho da spec 027). */
  @Post(':id/files')
  addFile(
    @Param('id') id: string,
    @Body() dto: CreateStoreFileDto,
    @Headers('origin') origin?: string,
  ) {
    return this.service.addFile(id, dto, origin);
  }

  @Post(':id/files/:fileId/complete')
  @HttpCode(200)
  completeFile(@Param('id') id: string, @Param('fileId') fileId: string) {
    return this.service.completeFile(id, fileId);
  }

  @Delete(':id/files/:fileId')
  @HttpCode(204)
  removeFile(@Param('id') id: string, @Param('fileId') fileId: string) {
    return this.service.removeFile(id, fileId);
  }
}
