import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { LEVELS, type Level } from '../../types/student.level';

/**
 * Fecha a consolidação granular. Não carrega conteúdo: o backend confere no
 * Firestore se todos os módulos anunciados em `moduleCount` chegaram e, só
 * então, torna o material legível para o aluno.
 */
export class FinishConsolidationDto {
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @IsString()
  @IsNotEmpty()
  @IsEnum(LEVELS)
  level: Level;

  constructor(studentId: string, level: Level) {
    this.studentId = studentId;
    this.level = level;
  }
}
