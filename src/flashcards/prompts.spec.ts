import { buildStudentDeckPrompt, buildTopicDeckPrompt } from './prompts';

describe('prompts de flashcards', () => {
  describe('baralho de tópico', () => {
    it('junta o Prompt de Flashcards, o nível, o módulo e o tópico, e pede o formato', () => {
      const prompt = buildTopicDeckPrompt({
        flashcardsPrompt: 'CONTEXTO FLASH',
        levelPrompt: 'PROMPT DO B1',
        level: 'B1',
        moduleTitle: 'Viagens',
        moduleContext: 'foco em aeroporto',
        topicTitle: 'No check-in',
        count: 40,
      });

      expect(prompt.indexOf('CONTEXTO FLASH')).toBeLessThan(
        prompt.indexOf('PROMPT DO B1'),
      );
      expect(prompt).toContain('Nível do aluno: B1');
      expect(prompt).toContain('"Viagens"');
      expect(prompt).toContain('foco em aeroporto');
      expect(prompt).toContain('"No check-in"');
      expect(prompt).toContain('exatamente 40');
      expect(prompt).toContain('"exampleTranslation"');
      expect(prompt).toContain('phrasal verb');
    });

    it('não deixa blocos vazios quando o nível ou a diretriz do módulo estão em branco', () => {
      const prompt = buildTopicDeckPrompt({
        flashcardsPrompt: 'CONTEXTO',
        levelPrompt: '   ',
        level: 'A1',
        moduleTitle: 'M',
        moduleContext: '',
        topicTitle: 'T',
        count: 40,
      });
      expect(prompt).not.toMatch(/\n{3,}/);
      expect(prompt).not.toContain('Diretriz');
    });
  });

  describe('baralho do aluno', () => {
    it('usa objetivo e prognóstico do aluno do plano', () => {
      const prompt = buildStudentDeckPrompt({
        flashcardsPrompt: 'CONTEXTO',
        levelPrompt: 'NIVEL',
        level: 'A2',
        student: {
          firstName: 'Ana',
          objectives: 'apresentar campanhas para clientes',
          prognosis: 'trava ao falar de prazos',
        },
        count: 72,
      });
      expect(prompt).toContain('apresentar campanhas para clientes');
      expect(prompt).toContain('trava ao falar de prazos');
      expect(prompt).toContain('exatamente 72');
      expect(prompt).toContain('do dia a dia de Ana');
    });

    it('usa as 3 respostas do comprador da loja', () => {
      const prompt = buildStudentDeckPrompt({
        flashcardsPrompt: 'CONTEXTO',
        levelPrompt: '',
        level: 'B2',
        student: {
          firstName: 'Caio',
          objectives: '',
          prognosis: '',
          profile: {
            workArea: 'Saúde',
            careerStage: 'Pleno',
            englishContact: 'Leio no trabalho',
          },
        },
        count: 72,
      });
      expect(prompt).toContain('Área de trabalho: Saúde');
      expect(prompt).toContain('Leio no trabalho');
      expect(prompt).not.toContain('Prognóstico');
    });
  });
});
