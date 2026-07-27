import { Injectable } from '@nestjs/common';
import { Lesson } from './lesson.entity';

/** Estado da janela de entrada, do ponto de vista de quem pergunta. */
export type AccessState = 'closed' | 'open' | 'missed';

export interface AccessWindow {
  state: AccessState;
  opensAt: Date;
  missedAt: Date;
  closesAt: Date;
}

const MINUTE = 60_000;
export const OPENS_BEFORE_MIN = 10;
export const MISSED_AFTER_MIN = 15;
export const CLOSES_AFTER_MIN = 20;
/** Prazo da professora para marcar presença manualmente. */
export const MANUAL_ATTENDANCE_WINDOW_HOURS = 72;
/** Antecedência mínima para o aluno avisar ausência e para a professora remarcar. */
export const ADVANCE_NOTICE_HOURS = 4;

/**
 * Regras de tempo da aula (spec 010 §6.2), sempre no relógio do servidor:
 * o botão abre 10 min antes, some 20 min depois, e a partir de 15 min o aluno
 * já perdeu a aula.
 */
@Injectable()
export class LessonAccessService {
  window(lesson: Lesson): AccessWindow {
    const start = new Date(lesson.startAt).getTime();
    return {
      state: 'closed',
      opensAt: new Date(start - OPENS_BEFORE_MIN * MINUTE),
      missedAt: new Date(start + MISSED_AFTER_MIN * MINUTE),
      closesAt: new Date(start + CLOSES_AFTER_MIN * MINUTE),
    };
  }

  /** Janela do aluno: fechada → aberta → perdida → fechada. */
  studentState(lesson: Lesson, now: Date = new Date()): AccessState {
    const { opensAt, missedAt, closesAt } = this.window(lesson);
    if (now < opensAt) return 'closed';
    if (now < missedAt) return 'open';
    if (now < closesAt) return 'missed';
    return 'closed';
  }

  /**
   * Janela da professora: abre junto com a do aluno e não tem limite superior
   * enquanto a aula não for fechada — ela aguarda o aluno na sala.
   */
  teacherState(lesson: Lesson, now: Date = new Date()): AccessState {
    const { opensAt } = this.window(lesson);
    return now < opensAt ? 'closed' : 'open';
  }

  /** Passou de vez da janela do aluno (usado no fechamento automático). */
  isPastWindow(lesson: Lesson, now: Date = new Date()): boolean {
    return now >= this.window(lesson).closesAt;
  }

  /** Já passou o prazo de correção manual da professora (72 h). */
  isPastManualWindow(lesson: Lesson, now: Date = new Date()): boolean {
    const deadline =
      new Date(lesson.startAt).getTime() +
      MANUAL_ATTENDANCE_WINDOW_HOURS * 60 * MINUTE;
    return now.getTime() >= deadline;
  }

  /** Horas que faltam para o início da aula (negativo se já começou). */
  hoursUntilStart(lesson: Lesson, now: Date = new Date()): number {
    return (new Date(lesson.startAt).getTime() - now.getTime()) / (60 * MINUTE);
  }

  /** Ainda dá tempo de avisar/remarcar com a antecedência mínima? */
  hasAdvanceNotice(lesson: Lesson, now: Date = new Date()): boolean {
    return this.hoursUntilStart(lesson, now) >= ADVANCE_NOTICE_HOURS;
  }
}
