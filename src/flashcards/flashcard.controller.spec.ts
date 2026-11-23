import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';
import { FlashcardController } from './flashcard.controller';

describe('FlashcardController', () => {
  const service = {
    listTopicDecks: jest.fn().mockResolvedValue([]),
    generateTopicDeck: jest.fn().mockResolvedValue({ id: 'd', cards: [] }),
    getStudentDeckSummary: jest.fn().mockResolvedValue({}),
    generateStudentDeck: jest.fn().mockResolvedValue({ id: 's' }),
  };
  const controller = new FlashcardController(service as any);

  function rolesOf(handler: keyof FlashcardController): string[] {
    return Reflect.getMetadata(
      ROLES_KEY,
      FlashcardController.prototype[handler],
    ) as string[];
  }

  it('baralhos de tópico são da professora; o do aluno, só da gerente', () => {
    expect(rolesOf('listTopicDecks')).toEqual([ROLES.TEACHER]);
    expect(rolesOf('generateTopicDeck')).toEqual([ROLES.TEACHER]);
    expect(rolesOf('getStudentDeck')).toEqual([ROLES.MANAGER]);
    expect(rolesOf('generateStudentDeck')).toEqual([ROLES.MANAGER]);
  });

  it('valida o nível e delega', async () => {
    await controller.generateTopicDeck('B1', 't1');
    expect(service.generateTopicDeck).toHaveBeenCalledWith('B1', 't1');
    expect(() => controller.listTopicDecks('Z9')).toThrow(BadRequestException);
  });

  it('devolve só o estado do baralho gerado, sem as cartas', async () => {
    service.generateTopicDeck.mockResolvedValueOnce({
      id: 'topic_B1_t1',
      status: 'ready',
      cards: [{ id: 'c01' }, { id: 'c02' }],
      generatedAt: 'x',
    });
    expect(await controller.generateTopicDeck('B1', 't1')).toEqual({
      id: 'topic_B1_t1',
      status: 'ready',
      cardCount: 2,
      generatedAt: 'x',
    });
  });
});
