import {
  cardKey,
  GeneratedCard,
  GeneratedDeckSchema,
  parseCardKey,
  studentDeckId,
  toDeckCards,
  topicDeckId,
  wordKey,
} from './flashcard.model';

function card(english: string): GeneratedCard {
  return {
    english,
    portuguese: 'pt',
    pronounce: 'pr',
    partOfSpeech: 'noun',
    example: 'ex',
    exampleTranslation: 'ext',
  };
}

describe('flashcard.model', () => {
  it('monta e separa as chaves de baralho e de carta', () => {
    const deck = topicDeckId('B1', '1b2c-uuid');
    expect(deck).toBe('topic_B1_1b2c-uuid');
    expect(studentDeckId('u1')).toBe('student_u1');
    expect(parseCardKey(cardKey(deck, 'c07'))).toEqual({
      deckId: deck,
      cardId: 'c07',
    });
    expect(parseCardKey('sem-separador')).toBeNull();
    expect(parseCardKey('deck:')).toBeNull();
  });

  it('compara palavras sem caixa, acento, "to " e pontuação', () => {
    expect(wordKey('To Follow-up')).toBe(wordKey('follow up'));
    expect(wordKey('Café')).toBe('cafe');
    expect(wordKey('tomorrow')).toBe('tomorrow');
  });

  it('tira repetidas e excluídas, corta no tamanho e numera c01..', () => {
    const cards = toDeckCards(
      [
        card('deadline'),
        card('Deadline'),
        card('to pitch'),
        card('commute'),
        card('book'),
      ],
      2,
      new Set([wordKey('pitch')]),
    );
    expect(cards.map((c) => [c.id, c.english])).toEqual([
      ['c01', 'deadline'],
      ['c02', 'commute'],
    ]);
  });

  it('recusa carta sem os campos que o verso mostra', () => {
    const semExemplo = { cards: [{ ...card('x'), example: '' }] };
    expect(GeneratedDeckSchema.safeParse(semExemplo).success).toBe(false);
    expect(GeneratedDeckSchema.safeParse({ cards: [card('x')] }).success).toBe(
      true,
    );
  });
});
