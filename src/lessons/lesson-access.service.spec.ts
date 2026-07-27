import { LessonAccessService } from './lesson-access.service';
import { Lesson } from './lesson.entity';

describe('LessonAccessService', () => {
  const service = new LessonAccessService();
  const start = new Date('2026-08-03T18:00:00.000Z'); // 15h em São Paulo
  const lesson = new Lesson({
    id: 'l1',
    startAt: start.toISOString(),
  });

  const at = (minutesFromStart: number) =>
    new Date(start.getTime() + minutesFromStart * 60_000);

  describe('janela do aluno', () => {
    it('fica fechada antes de 10 min do início', () => {
      expect(service.studentState(lesson, at(-11))).toBe('closed');
    });

    it('abre exatamente 10 min antes', () => {
      expect(service.studentState(lesson, at(-10))).toBe('open');
    });

    it('segue aberta na hora da aula e até 14 min depois', () => {
      expect(service.studentState(lesson, at(0))).toBe('open');
      expect(service.studentState(lesson, at(14))).toBe('open');
    });

    it('vira aula perdida a partir de 15 min', () => {
      expect(service.studentState(lesson, at(15))).toBe('missed');
      expect(service.studentState(lesson, at(19))).toBe('missed');
    });

    it('fecha de vez 20 min depois', () => {
      expect(service.studentState(lesson, at(20))).toBe('closed');
      expect(service.studentState(lesson, at(60))).toBe('closed');
    });
  });

  describe('janela da professora', () => {
    it('abre junto com a do aluno', () => {
      expect(service.teacherState(lesson, at(-11))).toBe('closed');
      expect(service.teacherState(lesson, at(-10))).toBe('open');
    });

    it('não tem limite superior — ela aguarda o aluno', () => {
      expect(service.teacherState(lesson, at(30))).toBe('open');
      expect(service.teacherState(lesson, at(120))).toBe('open');
    });
  });

  describe('prazos', () => {
    it('reconhece o fim da janela do aluno', () => {
      expect(service.isPastWindow(lesson, at(19))).toBe(false);
      expect(service.isPastWindow(lesson, at(20))).toBe(true);
    });

    it('fecha a correção manual em 72h', () => {
      expect(service.isPastManualWindow(lesson, at(71 * 60))).toBe(false);
      expect(service.isPastManualWindow(lesson, at(72 * 60))).toBe(true);
    });

    it('exige 4h de antecedência para avisar ou remarcar', () => {
      expect(service.hasAdvanceNotice(lesson, at(-4 * 60))).toBe(true);
      expect(service.hasAdvanceNotice(lesson, at(-3 * 60 - 59))).toBe(false);
      expect(service.hasAdvanceNotice(lesson, at(-10))).toBe(false);
    });
  });
});
