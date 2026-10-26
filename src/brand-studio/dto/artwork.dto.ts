import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ART_FORMAT_KEYS, type ArtFormat } from '../artwork.model';

/** Até 4 fotos por peça (spec 031 §4). */
export const MAX_PHOTOS = 4;

export class StoredFileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  url!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  path!: string;
}

export class CreateArtworkDto {
  @IsString()
  @IsNotEmpty({ message: 'Escreva o que a arte deve comunicar' })
  @MaxLength(2000)
  prompt!: string;

  @IsIn(ART_FORMAT_KEYS, { message: 'Formato inválido' })
  format!: ArtFormat;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  slideCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  identityId?: string;

  /** Identidade descrita na hora: substitui a salva nesta geração. */
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Descreva a identidade' })
  @MaxLength(20_000)
  customIdentity?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PHOTOS, { message: `No máximo ${MAX_PHOTOS} fotos` })
  @ValidateNested({ each: true })
  @Type(() => StoredFileDto)
  photos?: StoredFileDto[];
}

export class GenerateSlideDto {
  /** Ajuste pedido ao refazer o slide. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListArtworksQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  /** `createdAt` do último item da página anterior. */
  @IsOptional()
  @IsISO8601()
  before?: string;
}
