import { LEVELS } from '../types/student.level';

export type PerceivedLevel = (typeof LEVELS)[number];

/**
 * Registro pedagógico da professora sobre a evolução do aluno.
 * Coleção separada de propósito: `prognosis` (em `users`) é insumo do prompt
 * de geração de material; isto aqui é acompanhamento humano (spec 010 §5.8).
 * Visível para a professora responsável e para a gerente — não para o aluno.
 */
export class StudentFeedback {
  id!: string;
  studentId!: string;
  studentName?: string;
  teacherId!: string;
  teacherName?: string;
  lessonId?: string;
  date!: string; // 'YYYY-MM-DD'
  perceivedLevel?: PerceivedLevel;
  text!: string;
  createdAt!: string;

  constructor(data: Partial<StudentFeedback>) {
    Object.assign(this, data);
  }
}
