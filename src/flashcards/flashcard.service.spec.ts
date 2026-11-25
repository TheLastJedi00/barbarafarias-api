import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FlashcardService, studentContext } from './flashcard.service';
import {
  Flashcard,
  FlashcardDeck,
  GeneratedCard,
  STUDENT_DECK_SIZE,
  TOPIC_DECK_SIZE,
} from './flashcard.model';
import { User } from '../users/user.entity';

function cards(n: number, prefix = 'w'): GeneratedCard[] {
  return Array.from({ length: n }, (_, i) => ({
    english: `${prefix}${i}`,
    portuguese: 'pt',
    pronounce: 'pr',
    partOfSpeech: 'noun',
    example: 'ex',
    exampleTranslation: 'ext',
  }));
}

function deck(partial: Partial<FlashcardDeck>): FlashcardDeck {
  return {
    id: 'd',
    kind: 'topic',
    status: 'ready',
    cards: [],
    updatedAt: '2026-11-22T00:00:00.000Z',
    ...partial,
  };
}

const curriculum = {
  level: 'B1',
  prompt: 'PROMPT DO NÍVEL',
  modules: [
    {
      id: 'm1',
      title: 'Viagens',
      context: 'aeroporto',
      order: 0,
      topics: [
        { id: 't1', title: 'Check-in', order: 0 },
        { id: 't2', title: 'Só vídeo', order: 1, videoOnly: true },
      ],
    },
    {
      id: 'm2',
      title: 'Trabalho',
      context: '',
      order: 1,
      topics: [{ id: 't3', title: 'Reuniões', order: 0 }],
    },
  ],
};

describe('FlashcardService', () => {
  let service: FlashcardService;
  let repo: Record<string, jest.Mock>;
  let curriculumService: Record<string, jest.Mock>;
  let users: Record<string, jest.Mock>;
  let gemini: { generateJson: jest.Mock; streamJson: jest.Mock };
  let background: { run: jest.Mock };

  beforeEach(() => {
    repo = {
      findById: jest.fn().mockResolvedValue(null),
      findTopicDecksByLevel: jest.fn().mockResolvedValue([]),
      markGenerating: jest.fn().mockResolvedValue(undefined),
      saveCards: jest.fn().mockResolvedValue(undefined),
      markError: jest.fn().mockResolvedValue(undefined),
      saveProgress: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined),
    };
    curriculumService = {
      getLevel: jest.fn().mockResolvedValue(curriculum),
      getFlashcardsPrompt: jest.fn().mockResolvedValue({ prompt: 'FLASH' }),
    };
    users = { findById: jest.fn() };
    gemini = { generateJson: jest.fn(), streamJson: jest.fn() };
    background = {
      run: jest.fn((_label: string, task: () => Promise<unknown>) =>
        task().then(() => undefined),
      ),
    };
    service = new FlashcardService(
      repo as any,
      curriculumService as any,
      users as any,
      gemini as any,
      background as any,
    );
  });

  describe('baralho de tópico', () => {
    it('gera 40 cartas numeradas, sem repetidas, e grava o título de origem', async () => {
      gemini.generateJson.mockResolvedValue({
        cards: [...cards(3, 'dup'), ...cards(3, 'dup'), ...cards(50)],
      });

      const result = await service.generateTopicDeck('B1', 't1');

      expect(repo.markGenerating).toHaveBeenCalledWith({
        id: 'topic_B1_t1',
        kind: 'topic',
        level: 'B1',
        moduleId: 'm1',
        topicId: 't1',
      });
      const prompt = gemini.generateJson.mock.calls[0][0] as string;
      expect(prompt).toContain('FLASH');
      expect(prompt).toContain('PROMPT DO NÍVEL');
      expect(prompt).toContain('"Check-in"');
      expect(prompt).toContain('aeroporto');

      const [id, saved, title] = repo.saveCards.mock.calls[0];
      expect(id).toBe('topic_B1_t1');
      expect(saved).toHaveLength(TOPIC_DECK_SIZE);
      expect(saved[0].id).toBe('c01');
      expect(new Set(saved.map((c: GeneratedCard) => c.english)).size).toBe(
        TOPIC_DECK_SIZE,
      );
      expect(title).toBe('Check-in');
      expect(result.status).toBe('ready');
    });

    it('recusa tópico inexistente ou só de vídeo', async () => {
      await expect(service.generateTopicDeck('B1', 'nada')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.generateTopicDeck('B1', 't2')).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.markGenerating).not.toHaveBeenCalled();
    });

    it('marca erro quando a IA falha ou devolve cartas de menos', async () => {
      gemini.generateJson.mockRejectedValueOnce(new Error('timeout'));
      await expect(service.generateTopicDeck('B1', 't1')).rejects.toThrow();
      expect(repo.markError).toHaveBeenCalledWith(
        'topic_B1_t1',
        expect.any(String),
      );

      gemini.generateJson.mockResolvedValueOnce({ cards: cards(5) });
      await expect(service.generateTopicDeck('B1', 't1')).rejects.toThrow();
      expect(repo.saveCards).not.toHaveBeenCalled();
    });
  });

  describe('estado dos baralhos do nível', () => {
    it('lista um por tópico comum, aponta desatualizado e apaga os órfãos', async () => {
      repo.findTopicDecksByLevel.mockResolvedValue([
        deck({
          id: 'topic_B1_t1',
          topicId: 't1',
          sourceTitle: 'Check in antigo',
          cards: cards(40) as any,
        }),
        deck({ id: 'topic_B1_t2', topicId: 't2' }),
        deck({ id: 'topic_B1_velho', topicId: 'velho' }),
      ]);

      const list = await service.listTopicDecks('B1');

      expect(list).toEqual([
        expect.objectContaining({
          topicId: 't1',
          moduleId: 'm1',
          status: 'ready',
          stale: true,
          cardCount: 40,
        }),
        expect.objectContaining({
          topicId: 't3',
          moduleId: 'm2',
          status: 'missing',
          stale: false,
          cardCount: 0,
        }),
      ]);
      expect(repo.deleteMany).toHaveBeenCalledWith([
        'topic_B1_t2',
        'topic_B1_velho',
      ]);
    });
  });

  describe('baralho do aluno', () => {
    const promptOf = (call: number) =>
      (gemini.streamJson.mock.calls as unknown[][])[call][0] as string;
    const savedCards = () =>
      (repo.saveCards.mock.calls as unknown[][])[0][1] as Flashcard[];
    const aluna = {
      id: 'u1',
      fullName: 'Ana Souza',
      level: 'B1',
      objective: 'apresentar campanhas',
      prognosis: 'trava em prazos',
    } as User;

    it('pede 72, tira repetidas e as dos tópicos do nível e guarda 62', async () => {
      users.findById.mockResolvedValue(aluna);
      repo.findTopicDecksByLevel.mockResolvedValue([
        deck({ cards: cards(10).map((c, i) => ({ ...c, id: `c${i}` })) }),
      ]);
      gemini.streamJson.mockResolvedValue({ cards: cards(80) });

      await service.generateStudentDeck('u1');

      expect(repo.markGenerating).toHaveBeenCalledWith(
        { id: 'student_u1', kind: 'student', studentId: 'u1' },
        { generated: 0, total: STUDENT_DECK_SIZE },
      );
      const prompt = gemini.streamJson.mock.calls[0][0] as string;
      expect(prompt).toContain('exatamente 72');
      expect(prompt).toContain('apresentar campanhas');
      const saved = repo.saveCards.mock.calls[0][1];
      expect(saved).toHaveLength(STUDENT_DECK_SIZE);
      // w0..w9 já existem nos baralhos de tópico
      expect(saved[0].english).toBe('w10');
    });

    it('manda no prompt as palavras dos tópicos do nível, sem repetir', async () => {
      users.findById.mockResolvedValue(aluna);
      repo.findTopicDecksByLevel.mockResolvedValue([
        deck({ cards: [{ ...cards(1, 'deadline')[0], id: 'c01' }] }),
        deck({
          cards: [
            { ...cards(1, 'Deadline')[0], id: 'c01' },
            { ...cards(1, 'meeting')[0], id: 'c02' },
          ],
        }),
      ]);
      gemini.streamJson.mockResolvedValue({ cards: cards(80) });

      await service.generateStudentDeck('u1');

      const prompt = promptOf(0);
      expect(prompt).toContain('NÃO USE');
      expect(prompt).toContain('deadline0, meeting0');
      expect(prompt).not.toContain('Deadline0');
    });

    it('resposta curta: pede o que falta numa segunda chamada e junta as duas', async () => {
      users.findById.mockResolvedValue(aluna);
      // w0..w39 já estão nos tópicos: das 72 da primeira, sobram 32
      repo.findTopicDecksByLevel.mockResolvedValue([
        deck({ cards: cards(40).map((c, i) => ({ ...c, id: `c${i}` })) }),
      ]);
      gemini.streamJson
        .mockResolvedValueOnce({ cards: cards(72) })
        .mockResolvedValueOnce({
          cards: [...cards(3, 'w4'), ...cards(40, 'extra')],
        });

      await service.generateStudentDeck('u1');

      expect(gemini.streamJson).toHaveBeenCalledTimes(2);
      const refill = promptOf(1);
      // pede as 30 que faltam com folga e evita as 32 já aceitas
      expect(refill).toContain('exatamente 40');
      expect(refill).toContain('w40');
      expect(refill).toContain('w71');
      const saved = savedCards();
      expect(saved).toHaveLength(STUDENT_DECK_SIZE);
      expect(saved[0]).toMatchObject({ id: 'c01', english: 'w40' });
      expect(saved[32]).toMatchObject({ id: 'c33', english: 'extra0' });
      expect(new Set(saved.map((c) => c.id)).size).toBe(STUDENT_DECK_SIZE);
      expect(repo.markError).not.toHaveBeenCalled();
    });

    it('a segunda chamada continua o andamento de onde a primeira parou', async () => {
      users.findById.mockResolvedValue(aluna);
      repo.findTopicDecksByLevel.mockResolvedValue([
        deck({ cards: cards(40).map((c, i) => ({ ...c, id: `c${i}` })) }),
      ]);
      const json = (n: number) =>
        `{"cards":[${cards(n)
          .map((c) => JSON.stringify(c))
          .join(',')},{"engl`;
      gemini.streamJson
        .mockResolvedValueOnce({ cards: cards(72) })
        .mockImplementationOnce(
          async (
            _p: string,
            _s: unknown,
            onProgress: (t: string) => unknown,
          ) => {
            for (const n of [3, 5, 40]) await onProgress(json(n));
            return { cards: cards(40, 'extra') };
          },
        );

      await service.generateStudentDeck('u1');

      expect(repo.saveProgress.mock.calls).toEqual([
        ['student_u1', { generated: 32, total: STUDENT_DECK_SIZE }],
        ['student_u1', { generated: 37, total: STUDENT_DECK_SIZE }],
        [
          'student_u1',
          { generated: STUDENT_DECK_SIZE, total: STUDENT_DECK_SIZE },
        ],
      ]);
    });

    it('baralho cheio na primeira resposta não faz segunda chamada', async () => {
      users.findById.mockResolvedValue(aluna);
      gemini.streamJson.mockResolvedValue({ cards: cards(72) });
      await service.generateStudentDeck('u1');
      expect(gemini.streamJson).toHaveBeenCalledTimes(1);
    });

    it('acima do mínimo depois da segunda chamada, guarda o baralho mais curto', async () => {
      users.findById.mockResolvedValue(aluna);
      repo.findTopicDecksByLevel.mockResolvedValue([
        deck({ cards: cards(40).map((c, i) => ({ ...c, id: `c${i}` })) }),
      ]);
      gemini.streamJson
        .mockResolvedValueOnce({ cards: cards(72) })
        .mockResolvedValueOnce({ cards: cards(20, 'extra') });

      await service.generateStudentDeck('u1');

      expect(savedCards()).toHaveLength(52);
    });

    it('ainda abaixo do mínimo depois da segunda chamada, marca erro', async () => {
      users.findById.mockResolvedValue(aluna);
      repo.findTopicDecksByLevel.mockResolvedValue([
        deck({ cards: cards(60).map((c, i) => ({ ...c, id: `c${i}` })) }),
      ]);
      gemini.streamJson
        .mockResolvedValueOnce({ cards: cards(72) })
        .mockResolvedValueOnce({ cards: cards(72) });

      await expect(service.generateStudentDeck('u1')).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(gemini.streamJson).toHaveBeenCalledTimes(2);
      expect(repo.markError).toHaveBeenCalledWith(
        'student_u1',
        expect.stringContaining('12 palavras aproveitáveis'),
      );
      expect(repo.saveCards).not.toHaveBeenCalled();
    });

    it('sem objetivo nem questionário, recusa com mensagem clara', async () => {
      users.findById.mockResolvedValue({ ...aluna, objective: ' ' });
      await expect(service.generateStudentDeck('u1')).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(repo.markGenerating).not.toHaveBeenCalled();
    });

    it('ensureStudentDeck não regera baralho pronto nem em geração recente', async () => {
      repo.findById.mockResolvedValueOnce(deck({ status: 'ready' }));
      expect(await service.ensureStudentDeck('u1')).toBe(false);

      repo.findById.mockResolvedValueOnce(
        deck({ status: 'generating', updatedAt: new Date().toISOString() }),
      );
      expect(await service.ensureStudentDeck('u1')).toBe(false);
      expect(gemini.streamJson).not.toHaveBeenCalled();
    });

    it('grava o andamento a cada 5 cartas, sem passar do tamanho do baralho', async () => {
      users.findById.mockResolvedValue(aluna);
      const json = (n: number) =>
        `{"cards":[${cards(n)
          .map((c) => JSON.stringify(c))
          .join(',')},{"engl`;
      gemini.streamJson.mockImplementation(
        async (_p: string, _s: unknown, onProgress: (t: string) => unknown) => {
          for (const n of [0, 3, 5, 7, 10, 11, 72]) await onProgress(json(n));
          return { cards: cards(80) };
        },
      );

      await service.generateStudentDeck('u1');

      expect(repo.saveProgress.mock.calls).toEqual([
        ['student_u1', { generated: 5, total: STUDENT_DECK_SIZE }],
        ['student_u1', { generated: 10, total: STUDENT_DECK_SIZE }],
        [
          'student_u1',
          { generated: STUDENT_DECK_SIZE, total: STUDENT_DECK_SIZE },
        ],
      ]);
      expect(repo.saveCards).toHaveBeenCalledTimes(1);
    });

    it('startStudentDeck marca 0/62, responde na hora e gera em segundo plano', async () => {
      users.findById.mockResolvedValue(aluna);
      let finish!: (value: unknown) => void;
      gemini.streamJson.mockReturnValue(
        new Promise((resolve) => (finish = resolve)),
      );

      const progress = await service.startStudentDeck('u1');

      expect(progress).toEqual({ generated: 0, total: STUDENT_DECK_SIZE });
      expect(repo.markGenerating).toHaveBeenCalledTimes(1);
      expect(background.run).toHaveBeenCalledWith(
        'baralho do aluno u1',
        expect.any(Function),
      );
      expect(repo.saveCards).not.toHaveBeenCalled();

      finish({ cards: cards(80) });
      await background.run.mock.results[0].value;
      expect(repo.saveCards).toHaveBeenCalledTimes(1);
    });

    it('startStudentDeck sem contexto recusa na hora, sem marcar geração', async () => {
      users.findById.mockResolvedValue({ ...aluna, objective: '' });
      await expect(service.startStudentDeck('u1')).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(repo.markGenerating).not.toHaveBeenCalled();
      expect(background.run).not.toHaveBeenCalled();
    });

    it('ensureStudentDeck gera quando falta, deu erro ou a geração travou', async () => {
      users.findById.mockResolvedValue(aluna);
      gemini.streamJson.mockResolvedValue({ cards: cards(80) });

      repo.findById.mockResolvedValueOnce(null);
      expect(await service.ensureStudentDeck('u1')).toBe(true);

      repo.findById.mockResolvedValueOnce(
        deck({ status: 'generating', updatedAt: '2020-01-01T00:00:00.000Z' }),
      );
      expect(await service.ensureStudentDeck('u1')).toBe(true);
      expect(repo.saveCards).toHaveBeenCalledTimes(2);
    });
  });

  describe('studentContext', () => {
    it('usa objetivo + prognóstico; sem objetivo, o questionário; sem nada, null', () => {
      expect(
        studentContext({
          fullName: 'Ana S',
          objective: 'x',
          prognosis: 'y',
        } as User),
      ).toMatchObject({ firstName: 'Ana', objectives: 'x', prognosis: 'y' });

      const loja = studentContext({
        fullName: 'Caio',
        objective: '',
        careerProfile: {
          workArea: 'saude',
          careerStage: 'pleno',
          englishContact: 'nenhum',
          answeredAt: '',
        },
      } as User);
      expect(loja?.profile?.workArea).toBe('Saúde');

      expect(
        studentContext({ fullName: 'Zé', objective: '' } as User),
      ).toBeNull();
    });
  });
});
