import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FlashcardService, studentContext } from './flashcard.service';
import {
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
  let gemini: { generateJson: jest.Mock };

  beforeEach(() => {
    repo = {
      findById: jest.fn().mockResolvedValue(null),
      findTopicDecksByLevel: jest.fn().mockResolvedValue([]),
      markGenerating: jest.fn().mockResolvedValue(undefined),
      saveCards: jest.fn().mockResolvedValue(undefined),
      markError: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined),
    };
    curriculumService = {
      getLevel: jest.fn().mockResolvedValue(curriculum),
      getFlashcardsPrompt: jest.fn().mockResolvedValue({ prompt: 'FLASH' }),
    };
    users = { findById: jest.fn() };
    gemini = { generateJson: jest.fn() };
    service = new FlashcardService(
      repo as any,
      curriculumService as any,
      users as any,
      gemini as any,
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
      gemini.generateJson.mockResolvedValue({ cards: cards(80) });

      await service.generateStudentDeck('u1');

      expect(repo.markGenerating).toHaveBeenCalledWith({
        id: 'student_u1',
        kind: 'student',
        studentId: 'u1',
      });
      const prompt = gemini.generateJson.mock.calls[0][0] as string;
      expect(prompt).toContain('exatamente 72');
      expect(prompt).toContain('apresentar campanhas');
      const saved = repo.saveCards.mock.calls[0][1];
      expect(saved).toHaveLength(STUDENT_DECK_SIZE);
      // w0..w9 já existem nos baralhos de tópico
      expect(saved[0].english).toBe('w10');
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
      expect(gemini.generateJson).not.toHaveBeenCalled();
    });

    it('ensureStudentDeck gera quando falta, deu erro ou a geração travou', async () => {
      users.findById.mockResolvedValue(aluna);
      gemini.generateJson.mockResolvedValue({ cards: cards(80) });

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
