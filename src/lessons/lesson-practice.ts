import type { PracticeSummary } from '../practice/mission-builder';
import { Lesson } from './lesson.entity';

/**
 * Média dos flashcards ao lado da aula (spec 037 §5.6). Só na resposta: nunca
 * gravada no doc da aula, que não sabe quando o aluno pratica.
 */
export interface LessonPractice {
  /** Aluno: a média dele. Turma: a média das médias de quem já fez missão. */
  practiceAverage?: number;
  /** Aluno: missões feitas. Turma: quantos alunos entraram na média. */
  practiceCount?: number;
  /** Só na turma: quantos alunos ela tem. */
  practiceTotal?: number;
}

export type LessonWithPractice = Lesson & LessonPractice;

/** Os alunos cujas médias a lista de aulas precisa. */
export function studentIdsOf(
  lessons: Pick<Lesson, 'studentId' | 'turmaId'>[],
  turmaStudents: Map<string, string[]>,
): string[] {
  const ids = new Set<string>();
  for (const lesson of lessons) {
    if (lesson.studentId) ids.add(lesson.studentId);
    if (lesson.turmaId) {
      (turmaStudents.get(lesson.turmaId) ?? []).forEach((id) => ids.add(id));
    }
  }
  return [...ids];
}

export function attachPracticeAverages(
  lessons: Lesson[],
  summaries: Map<string, PracticeSummary>,
  turmaStudents: Map<string, string[]>,
): LessonWithPractice[] {
  return lessons.map((lesson) => {
    if (lesson.studentId) {
      const summary = summaries.get(lesson.studentId);
      return summary
        ? with_(lesson, {
            practiceAverage: summary.average,
            practiceCount: summary.missions,
          })
        : lesson;
    }
    if (lesson.turmaId) {
      const students = turmaStudents.get(lesson.turmaId) ?? [];
      const averages = students
        .map((id) => summaries.get(id)?.average)
        .filter((a): a is number => typeof a === 'number');
      if (averages.length === 0) return lesson;
      const mean = averages.reduce((sum, a) => sum + a, 0) / averages.length;
      return with_(lesson, {
        practiceAverage: Math.round(mean * 10) / 10,
        practiceCount: averages.length,
        practiceTotal: students.length,
      });
    }
    return lesson;
  });
}

/** Cópia que mantém o protótipo: `Lesson` tem getters que o spread perderia. */
function with_(lesson: Lesson, practice: LessonPractice): LessonWithPractice {
  return Object.assign(
    Object.create(Object.getPrototypeOf(lesson) as object) as Lesson,
    lesson,
    practice,
  );
}
