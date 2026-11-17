import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LEVELS, type Level } from '../../types/student.level';
import {
  STORE_MAX_INSTALLMENTS,
  STORE_PRODUCT_KINDS,
  type StoreProductKind,
} from '../store-product.model';

export class StoreCoverDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  url!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  path!: string;
}

/** Campos editáveis em qualquer momento. */
class StoreProductFieldsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'O título é obrigatório' })
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  /** `null` remove a capa. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StoreCoverDto)
  cover?: StoreCoverDto | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'O preço precisa ser maior que zero' })
  @Max(100_000)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(STORE_MAX_INSTALLMENTS)
  maxInstallments?: number;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

/**
 * Novo produto. `kind`, `level` e `moduleId` de um módulo **não mudam** depois:
 * as compras apontam para o módulo, e trocá-lo por baixo mudaria o que o
 * comprador pagou para ver.
 */
export class CreateStoreProductDto extends StoreProductFieldsDto {
  @IsIn(STORE_PRODUCT_KINDS)
  kind!: StoreProductKind;

  @IsString()
  @IsNotEmpty({ message: 'O título é obrigatório' })
  @MaxLength(120)
  declare title: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'O preço precisa ser maior que zero' })
  @Max(100_000)
  declare price: number;

  @IsOptional()
  @IsIn(LEVELS)
  level?: Level;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  moduleId?: string;
}

export class UpdateStoreProductDto extends StoreProductFieldsDto {
  /** Só para `download`: o nível é opcional e serve ao filtro da vitrine. */
  @IsOptional()
  @IsIn([...LEVELS, null])
  level?: Level | null;
}

export class ReorderStoreProductsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids!: string[];
}

export class CreateStoreFileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  size!: number;
}
