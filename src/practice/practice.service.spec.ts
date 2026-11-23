import { ForbiddenException } from '@nestjs/common';
import { MissionView, PracticeService } from './practice.service';
import { emptyProgress, MissionDay } from './mission-builder';
import { FlashcardDeck } from '../flashcards/flashcard.model';

function deck(
  id: string,
  n: number,
  extra: Partial<FlashcardDeck> = {},
): FlashcardDeck {
  return {
    id,
    kind: id.startsWith('student_') ? 'student' : 'topic',
    status: 'ready',
    updatedAt: new Date().toISOString(),
    cards: Array.from({ length: n }, (_, i) => ({
      id: `c${String(i + 1).padStart(2, '0')}`,
      english: `${id}-${i}`,
      portuguese: 'pt',
      pronounce: 'pr',
      partOfSpeech: 'noun',
      example: 'ex',
      exampleTranslation: 'ext',
    })),
    ...extra,
  };
}

const curriculumB1 = {
  level: 'B1',
  prompt: '',
  modules: [
    {
      id: 'm1',
      title: 'M1',
      context: '',
      order: 0,
      topics: [
        { id: 't1', title: 'T1', order: 0 },
        { id: 'tv', title: 'Vídeo', order: 1, videoOnly: true },
      ],
    },
    {
      id: 'm2',
      title: 'M2',
      context: '',
      order: 1,
      topics: [{ id: 't2', title: 'T2', order: 0 }],
    },
  ],
};

describe('PracticeService', () => {
  let service: PracticeService;
  let repo: Record<string, jest.Mock>;
  let decks: Record<string, jest.Mock>;
  let flashcards: Record<string, jest.Mock>;
  let curriculum: Record<string, jest.Mock>;
  let users: Record<string, jest.Mock>;
  let purchases: Record<string, jest.Mock>;

  const planStudent = {
    id: 'u1',
    fullName: 'Ana',
    level: 'B1',
    isPaying: true,
    objective: 'x',
  };

  beforeEach(() => {
    repo = {
      getProgress: jest.fn().mockResolvedValue(emptyProgress()),
      getDay: jest.fn().mockResolvedValue(null),
      createDay: jest.fn(async (_uid: string, day: MissionDay) => day),
      answer: jest.fn(),
    };
    decks = {
      findById: jest.fn().mockResolvedValue(deck('student_u1', 62)),
      findMany: jest.fn(async (ids: string[]) => ids.map((id) => deck(id, 40))),
    };
    flashcards = {
      startStudentDeck: jest
        .fn()
        .mockResolvedValue({ generated: 0, total: 62 }),
    };
    curriculum = { getLevel: jest.fn().mockResolvedValue(curriculumB1) };
    users = { findById: jest.fn().mockResolvedValue(planStudent) };
    purchases = { findByUser: jest.fn().mockResolvedValue([]) };
    service = new PracticeService(
      repo as any,
      decks as any,
      flashcards as any,
      curriculum as any,
      users as any,
      purchases as any,
    );
  });

  describe('today (T15)', () => {
    it('aluno do plano: banco com os tópicos do nível, sem os só de vídeo', async () => {
      const mission = (await service.today('u1')) as MissionView;

      expect(decks.findMany).toHaveBeenCalledWith([
        'topic_B1_t1',
        'topic_B1_t2',
      ]);
      expect(mission.cards).toHaveLength(10);
      expect(mission.cards.filter((c) => c.source === 'student')).toHaveLength(
        2,
      );
      expect(repo.createDay).toHaveBeenCalledTimes(1);
    });

    it('devolve a missão já montada sem montar outra', async () => {
      repo.getDay.mockResolvedValue({
        day: 'x',
        cards: [],
        answers: {},
        score: 0,
      });
      await service.today('u1');
      expect(repo.createDay).not.toHaveBeenCalled();
      expect(decks.findMany).not.toHaveBeenCalled();
    });

    it('comprador da loja: só os tópicos dos módulos comprados e vigentes', async () => {
      users.findById.mockResolvedValue({
        ...planStudent,
        isPaying: false,
        tier: 'modules',
      });
      purchases.findByUser.mockResolvedValue([
        {
          kind: 'module',
          level: 'B1',
          moduleId: 'm2',
          status: 'PAID',
          accessUntil: '2999-01-01T00:00:00Z',
        },
        {
          kind: 'module',
          level: 'B1',
          moduleId: 'm1',
          status: 'PAID',
          accessUntil: '2000-01-01T00:00:00Z',
        },
      ]);
      await service.today('u1');
      expect(decks.findMany).toHaveBeenCalledWith(['topic_B1_t2']);
    });

    it('sem plano nem módulo vigente: 403', async () => {
      users.findById.mockResolvedValue({ ...planStudent, isPaying: false });
      await expect(service.today('u1')).rejects.toThrow(ForbiddenException);
    });

    it('baralho do aluno faltando: começa a gerar e responde o andamento na hora', async () => {
      decks.findById.mockResolvedValue(null);

      const result = await service.today('u1');

      expect(flashcards.startStudentDeck).toHaveBeenCalledWith('u1');
      expect(result).toEqual({ generating: true, generated: 0, total: 62 });
      expect(repo.createDay).not.toHaveBeenCalled();
    });

    it('baralho do aluno em geração agora: devolve o andamento gravado, sem gerar outro', async () => {
      decks.findById.mockResolvedValue(
        deck('student_u1', 0, {
          status: 'generating',
          progress: { generated: 20, total: 62 },
        }),
      );

      expect(await service.today('u1')).toEqual({
        generating: true,
        generated: 20,
        total: 62,
      });
      expect(flashcards.startStudentDeck).not.toHaveBeenCalled();
    });

    it('geração sem andamento gravado (anterior ao fix) conta do zero', async () => {
      decks.findById.mockResolvedValue(
        deck('student_u1', 0, { status: 'generating' }),
      );
      expect(await service.today('u1')).toEqual({
        generating: true,
        generated: 0,
        total: 62,
      });
    });

    it('baralho com erro ou geração travada: começa de novo', async () => {
      decks.findById.mockResolvedValueOnce(
        deck('student_u1', 0, { status: 'error' }),
      );
      await service.today('u1');
      decks.findById.mockResolvedValueOnce(
        deck('student_u1', 0, {
          status: 'generating',
          updatedAt: '2020-01-01T00:00:00.000Z',
        }),
      );
      await service.today('u1');

      expect(flashcards.startStudentDeck).toHaveBeenCalledTimes(2);
    });

    it('baralhos de tópico ainda não prontos ficam de fora', async () => {
      decks.findMany.mockResolvedValue([
        deck('topic_B1_t1', 40, { status: 'generating' }),
        deck('topic_B1_t2', 5),
      ]);
      const mission = (await service.today('u1')) as MissionView;
      expect(mission.cards.filter((c) => c.source === 'topic')).toHaveLength(5);
      expect(mission.cards).toHaveLength(10);
    });
  });

  describe('status', () => {
    it('sem missão ainda: pendente com 0 de 10', async () => {
      expect(await service.status('u1')).toMatchObject({
        available: true,
        pending: true,
        answered: 0,
        total: 10,
        streak: 0,
      });
    });

    it('sem acesso: indisponível e nada pendente', async () => {
      users.findById.mockResolvedValue({ ...planStudent, isPaying: false });
      expect(await service.status('u1')).toMatchObject({
        available: false,
        pending: false,
      });
    });
  });

  describe('answer', () => {
    it('aplica na transação e devolve o placar', async () => {
      const today = (await service.today('u1')) as MissionView;
      repo.answer.mockImplementation(async (_uid, _day, apply) =>
        apply(today, emptyProgress()),
      );
      const result = await service.answer('u1', today.cards[0].key, true);
      expect(result).toMatchObject({
        score: 1,
        answered: 1,
        total: 10,
        completed: false,
      });
    });
  });
});
