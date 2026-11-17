import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Etapa a gerar: `intro` ou o id de um tópico do módulo. */
export class StoreSupplyStepDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  stepId!: string;
}
