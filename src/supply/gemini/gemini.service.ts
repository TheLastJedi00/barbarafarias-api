import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ZodType } from 'zod';

/**
 * Ajustes por chamada (spec 031). Sem eles vale o modelo de `GEMINI_MODEL`,
 * o do material pedagógico; a Campanha usa `GEMINI_ART_MODEL`, mais rápido
 * para HTML, e mais temperatura, porque ali variação é desejável.
 */
export interface GenerationOptions {
  model?: string;
  temperature?: number;
}

const DEFAULT_TEMPERATURE = 0.3;

@Injectable()
export class GeminiProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private genAI: GoogleGenerativeAI;
  private readonly defaultModel: string;
  private readonly models = new Map<string, GenerativeModel>();

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.defaultModel =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-pro';
  }

  async generateContent(
    prompt: string,
    options: GenerationOptions = {},
  ): Promise<string> {
    try {
      const result = await this.model(options).generateContent(prompt);
      const response = await result.response;
      const text: string = response.text();
      return text
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
    } catch (error) {
      this.logger.error('Falha ao gerar conteúdo com o Gemini', error?.stack);
      throw new Error(
        `Failed to generate content with Gemini: ${error.message}`,
      );
    }
  }

  /**
   * Gera conteúdo e valida a resposta JSON contra um schema Zod.
   * Concentra o parsing/validação da IA aqui, fora das regras de negócio.
   */
  async generateJson<T>(
    prompt: string,
    schema: ZodType<T>,
    options: GenerationOptions = {},
  ): Promise<T> {
    const text = await this.generateContent(prompt, options);
    try {
      return schema.parse(JSON.parse(text));
    } catch (error) {
      this.logger.error('Resposta da IA em formato inválido', error?.stack);
      throw new InternalServerErrorException(
        'A IA retornou um formato inválido.',
      );
    }
  }

  /** Um `GenerativeModel` por combinação de modelo e temperatura, reaproveitado. */
  private model(options: GenerationOptions): GenerativeModel {
    const name = options.model || this.defaultModel;
    const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
    const key = `${name}@${temperature}`;
    let model = this.models.get(key);
    if (!model) {
      model = this.genAI.getGenerativeModel({
        model: name,
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 50000,
          temperature,
        },
      });
      this.models.set(key, model);
    }
    return model;
  }
}
