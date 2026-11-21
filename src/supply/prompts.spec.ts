import {
  buildModuleIntrosPrompt,
  buildTopicPrompt,
  composeBasePrompt,
  storeStudentInfo,
} from './prompts';

const blueprint = {
  level: 'A1' as const,
  modules: [
    {
      id: 'm1',
      title: 'Trabalho',
      context: '',
      topics: [{ id: 't1', title: 'Reuniões' }],
    },
  ],
};

describe('prompts', () => {
  it('base: principal + nível, sem partes vazias', () => {
    expect(composeBasePrompt(' Persona ', '')).toBe('Persona');
    expect(composeBasePrompt('Persona', 'Nível A1')).toBe(
      'Persona\n\nNível A1',
    );
  });

  describe('aluno do plano', () => {
    const student = {
      firstName: 'Ana',
      objectives: 'Viajar',
      prognosis: 'Boa base',
    };

    it('usa objetivo e prognóstico', () => {
      const prompt = buildTopicPrompt('Base', student, 'Trabalho', 'Reuniões');
      expect(prompt).toContain('Objetivos pessoais do aluno: Viajar');
      expect(prompt).toContain('Prognóstico da Teacher: Boa base');
    });
  });

  describe('comprador da loja (spec 033)', () => {
    const student = storeStudentInfo('Bruno Lima', {
      workArea: 'saude',
      careerStage: 'transicao',
      englishContact: 'filmes-musica',
      answeredAt: '2026-11-17T00:00:00.000Z',
    });

    it('troca objetivo e prognóstico pelas respostas do questionário', () => {
      const prompt = buildTopicPrompt('Base', student, 'Trabalho', 'Reuniões');
      expect(prompt).toContain('Nome: Bruno');
      expect(prompt).toContain('Área de trabalho: Saúde');
      expect(prompt).toContain('Etapa na carreira: Transição de carreira');
      expect(prompt).toContain(
        'Contato com o inglês nos últimos anos: Só em filmes e música',
      );
      expect(prompt).not.toContain('Prognóstico');
    });

    it('a intro conecta o módulo à área e à etapa, não ao prognóstico', () => {
      const prompt = buildModuleIntrosPrompt('Base', student, blueprint);
      expect(prompt).toContain('área de trabalho');
      expect(prompt).not.toContain('prognóstico da Teacher');
    });
  });
});
