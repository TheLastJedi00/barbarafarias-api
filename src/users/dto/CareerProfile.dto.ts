import { IsIn, IsString } from 'class-validator';
import {
  CAREER_STAGE_VALUES,
  ENGLISH_CONTACT_VALUES,
  WORK_AREA_VALUES,
} from '../career-profile';

/**
 * Respostas do questionário da loja (spec 033). Só as chaves da lista: texto
 * livre aqui iria direto para o prompt do Gemini.
 */
export class CareerProfileDto {
  @IsString()
  @IsIn(WORK_AREA_VALUES, { message: 'Área de trabalho inválida' })
  workArea!: string;

  @IsString()
  @IsIn(CAREER_STAGE_VALUES, { message: 'Etapa na carreira inválida' })
  careerStage!: string;

  @IsString()
  @IsIn(ENGLISH_CONTACT_VALUES, { message: 'Contato com o inglês inválido' })
  englishContact!: string;
}
