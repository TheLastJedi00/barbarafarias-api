import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { LEVELS, type Level } from '../../types/student.level';

/**
 * Pedido de geração de UM tópico isolado (geração granular).
 * Envia o contexto que a IA precisa — título do módulo e do tópico —
 * mais o par aluno/nível para reidratar os dados do aluno no backend.
 */
export class TopicRequestDto {
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @IsString()
  @IsNotEmpty()
  @IsEnum(LEVELS)
  level: Level;

  @IsString()
  @IsNotEmpty()
  moduleTitle: string;

  @IsString()
  @IsNotEmpty()
  topicTitle: string;

  constructor(
    studentId: string,
    level: Level,
    moduleTitle: string,
    topicTitle: string,
  ) {
    this.studentId = studentId;
    this.level = level;
    this.moduleTitle = moduleTitle;
    this.topicTitle = topicTitle;
  }
}
