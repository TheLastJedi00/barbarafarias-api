import { attachPracticeAverages, studentIdsOf } from './lesson-practice';
import { Lesson } from './lesson.entity';

describe('attachPracticeAverages (spec 037)', () => {
  const summaries = new Map([
    ['ana', { average: 8.4, missions: 12 }],
    ['caio', { average: 7.1, missions: 3 }],
    ['livia', { average: 6.9, missions: 5 }],
  ]);

  it('aula individual: a média do aluno e quantas missões', () => {
    const [lesson] = attachPracticeAverages(
      [{ id: 'l1', studentId: 'ana' } as Lesson],
      summaries,
      new Map(),
    );
    expect(lesson).toMatchObject({ practiceAverage: 8.4, practiceCount: 12 });
  });

  it('turma: média das médias de quem tem missão, e quantos de quantos', () => {
    const [lesson] = attachPracticeAverages(
      [{ id: 'l2', turmaId: 'tb1' } as Lesson],
      summaries,
      new Map([['tb1', ['ana', 'caio', 'livia', 'rafael']]]),
    );
    expect(lesson).toMatchObject({
      practiceAverage: 7.5,
      practiceCount: 3,
      practiceTotal: 4,
    });
  });

  it('sem missão nenhuma: não inventa média', () => {
    const [aluno, turma] = attachPracticeAverages(
      [
        { id: 'l3', studentId: 'julia' } as Lesson,
        { id: 'l4', turmaId: 'vazia' } as Lesson,
      ],
      summaries,
      new Map([['vazia', ['julia']]]),
    );
    expect(aluno.practiceAverage).toBeUndefined();
    expect(turma.practiceAverage).toBeUndefined();
  });

  it('lista os alunos que precisa ler', () => {
    expect(
      studentIdsOf(
        [{ studentId: 'ana' }, { turmaId: 'tb1' }, { studentId: 'ana' }],
        new Map([['tb1', ['caio', 'ana']]]),
      ).sort(),
    ).toEqual(['ana', 'caio']);
  });
});
