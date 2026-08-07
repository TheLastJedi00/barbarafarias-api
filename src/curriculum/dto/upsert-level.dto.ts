import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * Tópico enviado pelo painel. A `order` NÃO vem do cliente — o backend a deriva
 * da posição no array (fonte única de verdade da ordem). O `id` é gerado no FE;
 * se ausente, o backend gera um.
 *
 * `title` chamava-se `prompt` até a spec 020. O nome vinha da ideia original de
 * "instrução granular de geração", mas o painel sempre gravou ali o título do
 * tópico — e o título é o que a geração usa. Renomeado para descrever o dado.
 */
export class TopicInputDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  title!: string;
}

export class ModuleInputDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  title!: string;

  @IsString()
  context!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TopicInputDto)
  topics!: TopicInputDto[];
}

/** Upsert do nível inteiro: prompt do nível + árvore ordenada de módulos/tópicos. */
export class UpsertLevelDto {
  @IsString()
  prompt!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModuleInputDto)
  modules!: ModuleInputDto[];
}
