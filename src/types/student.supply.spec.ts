import { TopicSchema } from './student.supply';

describe('TopicSchema (spec 037)', () => {
  const topic = {
    topic: 'Greetings',
    description: 'd',
    examples: ['e'],
    curiosity: 'c',
    roleplayInstruction: 'r',
    roleplayDialog: ['a'],
    music: { title: 't', artist: 'a', youtube: 'y' },
  };

  it('o tópico não tem mais vocabulário', () => {
    expect(TopicSchema.safeParse(topic).success).toBe(true);
  });

  it('doc antigo com `words` ainda é lido, e o campo é descartado', () => {
    const parsed = TopicSchema.parse({
      ...topic,
      words: [{ english: 'hello', portuguese: 'olá', pronounce: 'rêlou' }],
    });
    expect(parsed).not.toHaveProperty('words');
  });
});
