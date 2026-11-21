import {
  CAREER_STAGES,
  ENGLISH_CONTACTS,
  WORK_AREAS,
  careerProfileLabels,
} from './career-profile';

describe('career-profile (spec 033)', () => {
  it('as opções têm chaves únicas e rótulo em todas', () => {
    for (const lista of [WORK_AREAS, CAREER_STAGES, ENGLISH_CONTACTS]) {
      const chaves = lista.map((o) => o.value);
      expect(new Set(chaves).size).toBe(chaves.length);
      expect(lista.every((o) => o.label.trim().length > 0)).toBe(true);
    }
  });

  it('traduz as chaves gravadas nos rótulos que vão para o prompt', () => {
    expect(
      careerProfileLabels({
        workArea: 'saude',
        careerStage: 'transicao',
        englishContact: 'le-no-trabalho',
        answeredAt: '2026-11-17T10:00:00.000Z',
      }),
    ).toEqual({
      workArea: 'Saúde',
      careerStage: 'Transição de carreira',
      englishContact: 'Leio no trabalho',
    });
  });

  it('chave desconhecida (opção removida depois) volta crua, sem quebrar', () => {
    expect(
      careerProfileLabels({
        workArea: 'astronauta',
        careerStage: 'pleno',
        englishContact: 'nenhum',
        answeredAt: '2026-11-17T10:00:00.000Z',
      }).workArea,
    ).toBe('astronauta');
  });
});
