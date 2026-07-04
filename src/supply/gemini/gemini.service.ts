import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ZodType } from 'zod';

@Injectable()
export class GeminiProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    const modelName =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-pro';

    this.model = this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 50000,
        temperature: 0.3,
      },
    });
  }

  async generateContent(prompt: string): Promise<string> {
    try {
      const result = await this.model.generateContent(prompt);
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
  async generateJson<T>(prompt: string, schema: ZodType<T>): Promise<T> {
    const text = await this.generateContent(prompt);
    try {
      return schema.parse(JSON.parse(text));
    } catch (error) {
      this.logger.error('Resposta da IA em formato inválido', error?.stack);
      throw new InternalServerErrorException(
        'A IA retornou um formato inválido.',
      );
    }
  }
}
