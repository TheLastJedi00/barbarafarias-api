import { InternalServerErrorException } from '@nestjs/common';
import { z } from 'zod';
import { GeminiProvider } from './gemini.service';

const generateContentStream = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({ generateContentStream }),
  })),
}));

function streamOf(...chunks: string[]) {
  return {
    stream: (async function* () {
      for (const chunk of chunks) yield { text: () => chunk };
    })(),
  };
}

describe('GeminiProvider.streamJson', () => {
  const config = {
    get: (key: string) => (key === 'GEMINI_API_KEY' ? 'k' : undefined),
  };
  const schema = z.object({ items: z.array(z.number()) });
  let provider: GeminiProvider;

  beforeEach(() => {
    generateContentStream.mockReset();
    provider = new GeminiProvider(config as any);
  });

  it('avisa o texto acumulado a cada pedaço e valida o JSON no fim', async () => {
    generateContentStream.mockResolvedValue(
      streamOf('```json\n{"items":[1,', '2,', '3]}\n```'),
    );
    const seen: string[] = [];

    const result = await provider.streamJson('p', schema, (text) => {
      seen.push(text);
    });

    expect(result).toEqual({ items: [1, 2, 3] });
    expect(seen).toEqual([
      '```json\n{"items":[1,',
      '```json\n{"items":[1,2,',
      '```json\n{"items":[1,2,3]}\n```',
    ]);
  });

  it('espera o aviso assíncrono e não cai quando ele falha', async () => {
    generateContentStream.mockResolvedValue(streamOf('{"items":', '[1]}'));
    const order: string[] = [];

    const result = await provider.streamJson('p', schema, async (text) => {
      await Promise.resolve();
      order.push(text);
      throw new Error('gravação do andamento falhou');
    });

    expect(result).toEqual({ items: [1] });
    expect(order).toEqual(['{"items":', '{"items":[1]}']);
  });

  it('JSON fora do schema vira erro claro', async () => {
    generateContentStream.mockResolvedValue(streamOf('{"items":["x"]}'));
    await expect(provider.streamJson('p', schema, () => {})).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('falha do Gemini no meio vira erro', async () => {
    generateContentStream.mockResolvedValue({
      stream: (async function* () {
        yield { text: () => '{"items":' };
        throw new Error('conexão caiu');
      })(),
    });
    await expect(provider.streamJson('p', schema, () => {})).rejects.toThrow(
      /conexão caiu/,
    );
  });
});
