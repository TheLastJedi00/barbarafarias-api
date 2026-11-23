import { countCompleteCards } from './deck-progress';

const card = (english: string) =>
  JSON.stringify({
    english,
    portuguese: 'pt',
    pronounce: 'pr',
    partOfSpeech: 'noun',
    example: 'ex',
    exampleTranslation: 'ext',
  });

describe('countCompleteCards', () => {
  it('sem texto ou antes da primeira carta, zero', () => {
    expect(countCompleteCards('')).toBe(0);
    expect(countCompleteCards('{"cards":[')).toBe(0);
    expect(countCompleteCards('{"cards":[{"english":"he')).toBe(0);
  });

  it('conta só as cartas fechadas, não a que está chegando', () => {
    const text = `{"cards":[${card('a')},${card('b')},{"english":"c","portu`;
    expect(countCompleteCards(text)).toBe(2);
  });

  it('com o JSON inteiro, conta todas', () => {
    const text = `{"cards":[${card('a')},${card('b')},${card('c')}]}`;
    expect(countCompleteCards(text)).toBe(3);
  });

  it('chaves e aspas escapadas dentro de strings não contam', () => {
    const tricky = JSON.stringify({
      english: 'say "}" twice',
      portuguese: 'diga {"a"} \\ duas vezes',
      pronounce: 'pr',
      partOfSpeech: 'noun',
      example: '} } {',
      exampleTranslation: 'ext',
    });
    const text = `{"cards":[${tricky},{"english":"x}`;
    expect(countCompleteCards(text)).toBe(1);
  });

  it('aceita a cerca de markdown e espaços antes do JSON', () => {
    const text = '```json\n{\n  "cards": [\n    ' + card('a') + ',\n    {';
    expect(countCompleteCards(text)).toBe(1);
  });
});
